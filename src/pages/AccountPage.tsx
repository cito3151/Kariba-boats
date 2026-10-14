import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CalendarClock, Trash2, UserRound } from 'lucide-react';
import PortalPage from '../components/portal/PortalPage';
import PortalSection from '../components/portal/PortalSection';
import Reveal from '../components/Reveal';
import {
  portalCard, portalButtonDanger, portalButtonPrimary, portalButtonSecondary,
} from '../components/portal/styles';
import { LoadingState } from '../components/StateViews';
import { useAuth } from '../data/AuthContext';
import { formatLongDate, useAccountDeletion } from '../hooks/useAccountDeletion';
import { portalPhotos } from '../data/photos';

// The signed-in user's account: who they are signed in as, the legal documents,
// and deleting the account. Deletion has a 30-day grace period (migration 33):
// the request is two deliberate steps, and while it is pending this page shows
// the date and a Cancel deletion button.

const ROLE_LABEL: Record<string, string> = {
  tourist: 'Guest', owner: 'Boat operator', hotel: 'Hotel or lodge', agency: 'Travel agency', admin: 'Administrator',
};

const textLink =
  'rounded-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500';

export default function AccountPage() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;

  const rows: [string, string][] = [
    ['Name', currentUser.name || 'Not given'],
    ['Email', currentUser.email],
    ['Account type', ROLE_LABEL[currentUser.role] ?? currentUser.role],
    ...(currentUser.phone ? [['Phone', currentUser.phone] as [string, string]] : []),
    ...(currentUser.businessName ? [['Business', currentUser.businessName] as [string, string]] : []),
  ];

  return (
    <PortalPage
      eyebrow="Your account"
      icon={UserRound}
      photo={portalPhotos.trips}
      title="Account"
      subtitle="Your details, our terms, and deleting your account."
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Account' }]}
    >
      <div className="grid max-w-3xl gap-10">
        <PortalSection title="Your details">
          <Reveal className={`${portalCard} p-4 sm:p-5`}>
            <dl className="divide-y divide-lake-100">
              {rows.map(([label, value]) => (
                <div key={label} className="grid gap-0.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-sm font-semibold text-lake-700">{label}</dt>
                  <dd className="break-words text-base text-lake-950">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[15px] leading-normal text-lake-700">
              To correct these details, <Link to="/privacy#contact-us" className={textLink}>contact us</Link>.
            </p>
          </Reveal>
        </PortalSection>

        <PortalSection title="Terms and privacy">
          <Reveal className={`${portalCard} p-4 sm:p-5`}>
            <p className="text-base leading-relaxed text-lake-900">
              Read our <Link to="/terms" className={textLink}>Terms and Conditions</Link> and{' '}
              <Link to="/privacy" className={textLink}>Privacy Policy</Link>. The Privacy Policy explains your rights
              and how to use them.
            </p>
          </Reveal>
        </PortalSection>

        <PortalSection title="Delete my account">
          <DeleteAccount isAdmin={currentUser.role === 'admin' || currentUser.isSuperAdmin} />
        </PortalSection>
      </div>
    </PortalPage>
  );
}

function DeleteAccount({ isAdmin }: { isAdmin: boolean }) {
  const reduce = useReducedMotion();
  const { status, loading, unavailable, error, pending, request, cancel, reload } = useAccountDeletion();
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const checkboxId = useId();
  const panelId = useId();
  const firstFocus = useRef<HTMLInputElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (step === 'confirm') firstFocus.current?.focus();
  }, [step]);

  const close = () => {
    setStep('idle');
    setUnderstood(false);
    setActionError('');
    requestAnimationFrame(() => startButton.current?.focus());
  };

  const confirm = async () => {
    if (busy || !understood) return;
    setBusy(true);
    setActionError('');
    try {
      await request();
      setStep('idle');
      setUnderstood(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not request deletion.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      await cancel();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel the deletion.');
    } finally {
      setBusy(false);
    }
  };

  const card = `${portalCard} p-4 sm:p-5`;

  if (isAdmin) {
    return (
      <Reveal className={card}>
        <p className="text-base leading-relaxed text-lake-900">
          Administrator accounts can't be deleted from here. Ask another super administrator to close this account.
        </p>
      </Reveal>
    );
  }

  if (loading && !status) return <LoadingState large label="Checking your account" />;

  if (unavailable) {
    return (
      <Reveal className={card}>
        <p className="text-base leading-relaxed text-lake-900">
          Deleting your account from this page is not available yet. To ask for your account to be deleted,{' '}
          <Link to="/privacy#contact-us" className={textLink}>contact us</Link> from the email address you signed up with.
        </p>
      </Reveal>
    );
  }

  if (error && !status) {
    return (
      <Reveal className={card}>
        <p role="alert" className="flex items-start gap-2 text-base leading-normal text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
        <button type="button" onClick={() => void reload()} className={`${portalButtonSecondary} mt-3`}>Try again</button>
      </Reveal>
    );
  }

  if (pending && status) {
    return (
      <Reveal className={card}>
        <div className="flex items-start gap-3">
          <CalendarClock size={22} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-lake-950">Your account is due to be deleted</h3>
            <p className="mt-1 text-base leading-relaxed text-lake-900">
              We will delete your account on <strong className="font-bold">{formatLongDate(status.scheduledFor)}</strong>.
              Until then nothing is removed and you can keep using it. You can cancel at any time before that date.
            </p>
            {actionError && <p role="alert" className="mt-2 text-[15px] text-red-800">{actionError}</p>}
            <button type="button" onClick={() => void undo()} disabled={busy} className={`${portalButtonPrimary} mt-4`}>
              {busy ? 'Cancelling' : 'Cancel deletion'}
            </button>
          </div>
        </div>
      </Reveal>
    );
  }

  const blocked = (status?.activeBookings ?? 0) > 0;

  return (
    <Reveal className={card}>
      <p className="text-base leading-relaxed text-lake-900">
        Deleting your account removes your personal information 30 days after you ask. Until then you can change your
        mind.
      </p>

      {blocked && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-3 text-[15px] leading-normal text-amber-900">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            You have {status!.activeBookings} upcoming booking{status!.activeBookings === 1 ? '' : 's'} still active.
            Cancel {status!.activeBookings === 1 ? 'it' : 'them'} in <Link to="/trips" className={textLink}>My trips</Link>,
            or wait until {status!.activeBookings === 1 ? 'it is' : 'they are'} completed, before you delete your account.
          </span>
        </p>
      )}

      {step === 'idle' && (
        <button
          ref={startButton}
          type="button"
          onClick={() => setStep('confirm')}
          disabled={blocked}
          className={`${portalButtonDanger} mt-4`}
        >
          <Trash2 size={16} aria-hidden /> Delete my account
        </button>
      )}

      <div id={panelId}>
        <AnimatePresence initial={false}>
          {step === 'confirm' && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduce ? 0.15 : 0.24, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50/60 p-4 sm:p-5">
                <h3 className="text-lg font-bold text-lake-950">Before you delete your account</h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-lake-900 marker:text-lake-600">
                  <li>
                    <strong className="font-bold">For 30 days nothing is deleted.</strong> You can still sign in, and you can
                    cancel the deletion on this page at any time.
                  </li>
                  <li>
                    After 30 days your name, phone number and business name are removed, verification documents you
                    uploaded are deleted, and you can no longer sign in.
                  </li>
                  <li>
                    <strong className="font-bold">Some records are kept</strong>, as the law requires: your past bookings
                    are kept for tax records for at least six years, with your name, phone number and notes removed. Reviews
                    you wrote stay published as "Former guest".
                  </li>
                  <li>
                    If you operate boats, they pass to another owner of your company on the platform, or are taken off the
                    website.
                  </li>
                  <li>
                    If you make a new booking in the 30 days, we wait until that trip is over before deleting.
                  </li>
                </ul>
                <p className="mt-2 text-[15px] leading-relaxed text-lake-800">
                  The <Link to="/privacy#deleting-your-account" className={textLink}>Privacy Policy</Link> has the details.
                </p>

                <label htmlFor={checkboxId} className="mt-4 flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-lake-200 bg-white p-3.5 text-base leading-6 text-lake-900 has-checked:border-red-400">
                  <input
                    ref={firstFocus}
                    id={checkboxId}
                    type="checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-red-700 outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
                  />
                  <span>I understand. Delete my account in 30 days.</span>
                </label>

                {actionError && (
                  <p role="alert" className="mt-3 flex items-start gap-2 text-[15px] leading-normal text-red-800">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> {actionError}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void confirm()} disabled={!understood || busy}
                    className={`${portalButtonBaseDanger}`}>
                    {busy ? 'Requesting' : 'Request deletion'}
                  </button>
                  <button type="button" onClick={close} disabled={busy} className={portalButtonSecondary}>
                    Keep my account
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reveal>
  );
}

// The final, committing button: solid red, white text (red-700 on white text is 6.5:1).
const portalButtonBaseDanger =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2.5 text-sm font-bold text-white outline-none transition-colors hover:bg-red-800 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:opacity-50';
