import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CalendarClock, CheckCircle2, Lock, Pencil, Trash2, UserRound } from 'lucide-react';
import PortalPage from '../components/portal/PortalPage';
import PortalSection from '../components/portal/PortalSection';
import Reveal from '../components/Reveal';
import {
  portalCard, portalButtonDanger, portalButtonPrimary, portalButtonSecondary,
} from '../components/portal/styles';
import { LoadingState } from '../components/StateViews';
import { useAuth, type AppUser } from '../data/AuthContext';
import { updateMyProfile } from '../services/auth.service';
import { formatLongDate, useAccountDeletion } from '../hooks/useAccountDeletion';
import { portalPhotos } from '../data/photos';

// The signed-in user's account: who they are signed in as (and editing their name,
// phone and business name), the legal documents, and deleting the account.
// Deletion has a 30-day grace period (migration 33): the request is two
// deliberate steps, and while it is pending this page shows the date and a
// Cancel deletion button.

const ROLE_LABEL: Record<string, string> = {
  tourist: 'Guest', owner: 'Boat operator', hotel: 'Hotel or lodge', agency: 'Travel agency', admin: 'Administrator',
};

const textLink =
  'rounded-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500';

export default function AccountPage() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;

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
          <YourDetails user={currentUser} />
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

// Business roles: the ones whose profile carries a business name.
const BUSINESS_ROLES = new Set(['owner', 'hotel', 'agency']);

const fieldLabel = 'block text-sm font-semibold text-lake-800';
const fieldInput =
  'mt-1.5 w-full min-w-0 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none transition-colors focus:border-lake-500 focus-visible:ring-2 focus-visible:ring-lake-500/40 aria-invalid:border-red-600';

// Loose on purpose: international numbers are written many ways. Digits with an
// optional leading +, spaces, dots, dashes and brackets, and 7 to 15 digits in
// all (the E.164 maximum).
function phoneProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\+?[\d\s().-]+$/.test(v)) return 'Use digits, spaces and an optional + at the start.';
  const digits = v.replace(/\D/g, '').length;
  if (digits < 7 || digits > 15) return 'Enter a phone number with 7 to 15 digits.';
  return null;
}

function YourDetails({ user }: { user: AppUser }) {
  const { refreshProfile } = useAuth();
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [businessName, setBusinessName] = useState(user.businessName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [saved, setSaved] = useState(false);
  // Set when the form closes, so the Edit details button takes focus as soon as
  // it is back on the page (it mounts only after the form's exit fade).
  const refocusEdit = useRef(false);
  const firstField = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const phoneId = useId();
  const businessId = useId();
  const businessNoteId = useId();

  const isBusiness = BUSINESS_ROLES.has(user.role);
  // guard_profile_privileges refuses this change for a verified business
  // (migration 37), so the field is read-only rather than refused on save.
  const businessLocked = isBusiness && user.isVerified;

  useEffect(() => {
    if (editing) firstField.current?.focus();
  }, [editing]);

  const rows: [string, string][] = [
    ['Name', user.name || 'Not given'],
    ['Email', user.email],
    ['Account type', ROLE_LABEL[user.role] ?? user.role],
    ['Phone', user.phone || 'Not given'],
    ...(isBusiness ? [['Business', user.businessName || 'Not given'] as [string, string]] : []),
  ];

  const start = () => {
    setFullName(user.name);
    setPhone(user.phone ?? '');
    setBusinessName(user.businessName ?? '');
    setError(''); setNameError(''); setPhoneError('');
    setSaved(false);
    setEditing(true);
  };

  const finish = () => {
    refocusEdit.current = true;
    setEditing(false);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const nameMsg = fullName.trim().length < 2 ? 'Enter your name.' : '';
    const phoneMsg = phoneProblem(phone) ?? '';
    setNameError(nameMsg);
    setPhoneError(phoneMsg);
    if (nameMsg || phoneMsg) return;

    setBusy(true); setError('');
    try {
      await updateMyProfile({
        fullName,
        phone,
        businessName: isBusiness && !businessLocked ? businessName : undefined,
      });
      await refreshProfile();
      setSaved(true);
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  };

  // A short cross-fade between the summary and the form; under reduced motion
  // there is no travel, only the fade.
  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
      initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 },
      transition: { duration: 0.2, ease: 'easeOut' as const },
    };

  return (
    <Reveal className={`${portalCard} p-4 sm:p-5`}>
      <AnimatePresence mode="wait" initial={false}>
        {!editing ? (
          <motion.div key="view" {...swap}>
            <dl className="divide-y divide-lake-100">
              {rows.map(([label, value]) => (
                <div key={label} className="grid gap-0.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-sm font-semibold text-lake-700">{label}</dt>
                  <dd className="break-words text-base text-lake-950">{value}</dd>
                </div>
              ))}
            </dl>
            {saved && (
              <p role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[15px] leading-normal text-emerald-900">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden /> Your details are saved.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
              <button
                ref={(el) => { if (el && refocusEdit.current) { refocusEdit.current = false; el.focus(); } }}
                type="button" onClick={start} className={portalButtonSecondary}>
                <Pencil size={15} aria-hidden /> Edit details
              </button>
              <p className="text-[15px] leading-normal text-lake-700">
                To change your email address, <Link to="/privacy#contact-us" className={textLink}>contact us</Link>.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.form key="edit" {...swap} onSubmit={save} noValidate aria-label="Edit your details">
            <div className="grid gap-4">
              <div>
                <label htmlFor={nameId} className={fieldLabel}>Full name</label>
                <input
                  ref={firstField} id={nameId} value={fullName} autoComplete="name"
                  onChange={(e) => { setFullName(e.target.value); if (nameError) setNameError(''); }}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? `${nameId}-error` : undefined}
                  className={fieldInput}
                />
                {nameError && <p id={`${nameId}-error`} className="mt-1.5 text-sm font-medium text-red-700">{nameError}</p>}
              </div>

              <div>
                <label htmlFor={phoneId} className={fieldLabel}>
                  Phone <span className="font-normal text-lake-700">(optional)</span>
                </label>
                <input
                  id={phoneId} type="tel" inputMode="tel" autoComplete="tel" value={phone}
                  placeholder="+263 77 123 4567"
                  onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(''); }}
                  onBlur={() => setPhoneError(phoneProblem(phone) ?? '')}
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={phoneError ? `${phoneId}-error` : user.role === 'owner' ? `${phoneId}-hint` : undefined}
                  className={`${fieldInput} tabular-nums`}
                />
                {phoneError ? (
                  <p id={`${phoneId}-error`} className="mt-1.5 text-sm font-medium text-red-700">{phoneError}</p>
                ) : user.role === 'owner' && (
                  <p id={`${phoneId}-hint`} className="mt-1.5 text-sm text-lake-700">Guests see this number on your boat listings.</p>
                )}
              </div>

              {isBusiness && (
                <div>
                  <label htmlFor={businessId} className={fieldLabel}>Business name</label>
                  <input
                    id={businessId}
                    value={businessLocked ? (user.businessName ?? '') : businessName}
                    autoComplete="organization"
                    readOnly={businessLocked}
                    aria-describedby={businessLocked ? businessNoteId : undefined}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className={`${fieldInput} ${businessLocked ? 'cursor-default bg-lake-50 text-lake-800' : ''}`}
                  />
                  {businessLocked && (
                    <p id={businessNoteId} className="mt-1.5 flex items-start gap-1.5 text-sm leading-normal text-lake-700">
                      <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
                      <span>
                        Your business is verified under this name{user.role === 'owner' ? ', and guests see it on your listings' : ''}.
                        To change it, <Link to="/privacy#contact-us" className={textLink}>contact us</Link> so an administrator can
                        check the new name.
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-800">
                <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={portalButtonPrimary}>
                {busy ? 'Saving' : 'Save details'}
              </button>
              <button type="button" onClick={finish} disabled={busy} className={portalButtonSecondary}>
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </Reveal>
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
