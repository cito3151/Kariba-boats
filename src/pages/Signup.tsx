import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Anchor, Building2, ClipboardCheck, MailCheck, Briefcase, UserRound } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import PageTransition from '../components/PageTransition';
import { useAuth, type Role } from '../data/AuthContext';
import { useCurrentDocuments } from '../components/legal/useCurrentDocuments';
import DocumentModal from '../components/legal/DocumentModal';
import { recordConsent, type LegalDocType } from '../services/legal.service';
import { requiredDocuments, type OperatorType } from '../services/companies.service';

const roleHome: Record<string, string> = {
  tourist: '/',
  owner: '/owner',
  hotel: '/hotel',
  agency: '/agency',
  admin: '/admin',
};

// How a boat operator works on the platform (migration 40, ADR-002). The proofs
// named here are what the company page asks for after signup.
const operatorOptions: { value: OperatorType; label: string; hint: string; icon: typeof Anchor }[] = [
  {
    value: 'individual', label: 'On my own', icon: UserRound,
    hint: 'A sole trader running your own boat. No company registration needed.',
  },
  {
    value: 'company', label: 'As a registered company', icon: Building2,
    hint: 'A business with a registration certificate. You can add managers and crew later.',
  },
];

const roleOptions: { value: Role; label: string; icon: typeof Anchor }[] = [
  { value: 'tourist', label: 'Tourist', icon: Anchor },
  { value: 'hotel', label: 'Hotel or lodge', icon: Building2 },
  { value: 'owner', label: 'Boat owner', icon: ClipboardCheck },
  { value: 'agency', label: 'Travel agency', icon: Briefcase },
];

export default function Signup() {
  const { signup, currentUser } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>('tourist');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [operatorType, setOperatorType] = useState<OperatorType | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const { get: getDoc } = useCurrentDocuments();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptOperator, setAcceptOperator] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [viewDoc, setViewDoc] = useState<LegalDocType | null>(null);
  const needsOperator = role === 'owner' || role === 'hotel';

  // When email confirmation is off, signUp returns a live session; redirect once
  // the profile resolves to the right home.
  useEffect(() => {
    if (currentUser) navigate(roleHome[currentUser.role] ?? '/', { replace: true });
  }, [currentUser, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!acceptTerms) {
      setError('Please accept the Terms and Conditions and Privacy Policy to continue.');
      return;
    }
    if (needsOperator && !acceptOperator) {
      setError('Please accept the Operator Agreement to continue.');
      return;
    }
    if (role === 'owner' && !operatorType) {
      setError('Choose whether you operate on your own or as a registered company.');
      return;
    }

    setBusy(true);
    try {
      const result = await signup({
        email,
        password,
        fullName: name,
        role,
        phone: phone || undefined,
        businessName: businessName || undefined,
        operatorType: role === 'owner' && operatorType ? operatorType : undefined,
      });
      if (result.needsConfirmation) {
        setConfirmSent(true);
      } else {
        const docTypes: { t: LegalDocType; accepted: boolean }[] = [
          { t: 'terms', accepted: true },
          { t: 'privacy', accepted: true },
        ];
        if (needsOperator) docTypes.push({ t: 'operator_agreement', accepted: true });
        docTypes.push({ t: 'marketing', accepted: marketingOptIn });
        for (const d of docTypes) {
          const doc = getDoc(d.t);
          if (doc) await recordConsent({ docType: d.t, version: doc.version, context: 'signup', accepted: d.accepted });
        }
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (confirmSent) {
    return (
      <PageTransition>
        <AuthCard title="Check your email" subtitle="One more step to activate your account">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
              className="mx-auto flex h-12 w-12 items-center justify-center"
            >
              <MailCheck size={44} className="text-emerald-500" />
            </motion.div>
            <p className="mt-3 text-sm text-lake-600">
              We sent a confirmation link to{' '}
              <span className="font-medium text-lake-900">{email}</span>. Click it to activate your
              account, then log in.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-block w-full rounded-lg bg-lake-700 py-2.5 text-sm font-semibold text-white hover:bg-lake-800 transition-colors"
            >
              Go to login
            </Link>
          </motion.div>
        </AuthCard>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <AuthCard title="Create an account" subtitle="Join Kariba Lake Connect" wide>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {roleOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRole(opt.value)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[13px] font-medium transition-colors ${
                role === opt.value
                  ? 'border-lake-600 bg-lake-50 text-lake-800'
                  : 'border-lake-100 text-lake-500 hover:bg-lake-50'
              }`}
            >
              <opt.icon size={18} />
              {opt.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {role === 'owner' && (
            <fieldset>
              <legend className="text-sm font-medium text-lake-700">How do you operate?</legend>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {operatorOptions.map((opt) => {
                  const selected = operatorType === opt.value;
                  return (
                    <label key={opt.value}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lake-500 motion-reduce:transition-none ${
                        selected ? 'border-lake-600 bg-lake-50' : 'border-lake-100 hover:bg-lake-50'
                      }`}>
                      <input type="radio" name="operator-type" value={opt.value} checked={selected}
                        onChange={() => setOperatorType(opt.value)}
                        className="mt-1 h-4 w-4 shrink-0 accent-lake-700" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[15px] font-semibold text-lake-950">
                          <opt.icon size={16} aria-hidden /> {opt.label}
                        </span>
                        <span className="mt-0.5 block text-sm leading-snug text-lake-700">{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {operatorType && (
                <p className="mt-2 text-sm leading-normal text-lake-700">
                  After signing up you upload:{' '}
                  {requiredDocuments(operatorType).map((d) => d.label.toLowerCase()).join(', ')}.
                </p>
              )}
            </fieldset>
          )}

          <div>
            <label className="block text-sm font-medium text-lake-700">Full name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-base outline-none focus:border-lake-400"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-lake-700">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-base outline-none focus:border-lake-400"
              placeholder="you@example.com"
            />
          </div>

          {(role === 'owner' || role === 'hotel' || role === 'agency') && (
            <div>
              <label className="block text-sm font-medium text-lake-700">
                {role === 'owner' && operatorType === 'individual' ? 'Trading name (optional)'
                  : role === 'owner' && operatorType === 'company' ? 'Registered company name'
                  : 'Business name'}
              </label>
              <input
                required={!(role === 'owner' && operatorType === 'individual')}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-base outline-none focus:border-lake-400"
                placeholder={role === 'hotel' ? 'e.g. Lake Kariba Lodge' : role === 'agency' ? 'e.g. Zambezi Travel' : 'e.g. Zambezi Houseboats'}
              />
            </div>
          )}

          {(role === 'owner' || role === 'tourist' || role === 'agency') && (
            <div>
              <label className="block text-sm font-medium text-lake-700">
                Phone / WhatsApp {role === 'owner' || role === 'agency' ? '' : '(optional)'}
              </label>
              <input
                required={role === 'owner' || role === 'agency'}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-base outline-none focus:border-lake-400"
                placeholder="+263 77 000 0000"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-lake-700">Password</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-base outline-none focus:border-lake-400"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-lake-700">Confirm password</label>
              <input
                required
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-base outline-none focus:border-lake-400"
                placeholder="Re-enter password"
              />
            </div>
          </div>

          {(role === 'hotel' || role === 'owner' || role === 'agency') && (
            <p className="text-sm text-lake-700">
              New {role === 'hotel' ? 'hotel' : role === 'agency' ? 'travel agency' : 'owner'} accounts are
              reviewed by the Kariba Lake Connect team, who check your uploaded registration documents
              before you go live. You can set everything up in your portal while verification is pending.
            </p>
          )}

          <div className="space-y-2 pt-1">
            <label className="flex items-start gap-2 text-sm text-lake-700">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5" />
              <span>
                I accept the{' '}
                {/* New tab, so the half-filled form is still here when they come back. */}
                <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-lake-700 underline">
                  Terms and Conditions<span className="sr-only"> (opens in a new tab)</span>
                </Link>
                {' '}and{' '}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-lake-700 underline">
                  Privacy Policy<span className="sr-only"> (opens in a new tab)</span>
                </Link>.
              </span>
            </label>
            {needsOperator && (
              <label className="flex items-start gap-2 text-sm text-lake-700">
                <input type="checkbox" checked={acceptOperator} onChange={(e) => setAcceptOperator(e.target.checked)}
                  className="mt-0.5" />
                <span>
                  I accept the{' '}
                  <button type="button" className="font-semibold text-lake-700 underline" onClick={() => setViewDoc('operator_agreement')}>Operator Agreement</button>.
                </span>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm text-lake-700">
              <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5" />
              <span>Send me occasional updates and offers (optional).</span>
            </label>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <AlertCircle size={14} /> {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-lake-950 hover:bg-sunset-400 transition-colors disabled:opacity-60"
          >
            {busy ? 'Creating account' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-lake-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-lake-700 hover:text-lake-900">
            Log in
          </Link>
        </p>
        <p className="mt-2 text-center text-[13px] text-lake-600">
          Admin accounts are provisioned internally and are not available through this form.
        </p>
        {viewDoc && <DocumentModal docType={viewDoc} onClose={() => setViewDoc(null)} />}
      </AuthCard>
    </PageTransition>
  );
}
