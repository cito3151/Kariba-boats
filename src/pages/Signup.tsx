import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Anchor, Building2, ClipboardCheck, MailCheck } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import PageTransition from '../components/PageTransition';
import { useAuth, type Role } from '../data/AuthContext';

const roleHome: Record<string, string> = {
  tourist: '/',
  owner: '/owner',
  hotel: '/hotel',
  admin: '/admin',
};

const roleOptions: { value: Role; label: string; icon: typeof Anchor }[] = [
  { value: 'tourist', label: 'Tourist', icon: Anchor },
  { value: 'hotel', label: 'Hotel or lodge', icon: Building2 },
  { value: 'owner', label: 'Boat owner', icon: ClipboardCheck },
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

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

    setBusy(true);
    try {
      const result = await signup({
        email,
        password,
        fullName: name,
        role,
        phone: phone || undefined,
        businessName: businessName || undefined,
      });
      if (result.needsConfirmation) {
        setConfirmSent(true);
      } else {
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
      <AuthCard title="Create an account" subtitle="Join Kariba Lake Access" wide>
        <div className="grid grid-cols-3 gap-2">
          {roleOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRole(opt.value)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors ${
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
          <div>
            <label className="text-xs font-medium text-lake-500">Full name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-lake-500">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
              placeholder="you@example.com"
            />
          </div>

          {(role === 'owner' || role === 'hotel') && (
            <div>
              <label className="text-xs font-medium text-lake-500">Business name</label>
              <input
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                placeholder={role === 'hotel' ? 'e.g. Lake Kariba Lodge' : 'e.g. Zambezi Houseboats'}
              />
            </div>
          )}

          {(role === 'owner' || role === 'tourist') && (
            <div>
              <label className="text-xs font-medium text-lake-500">
                Phone / WhatsApp {role === 'owner' ? '' : '(optional)'}
              </label>
              <input
                required={role === 'owner'}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                placeholder="+263 77 000 0000"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-lake-500">Password</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-lake-500">Confirm password</label>
              <input
                required
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                placeholder="Re-enter password"
              />
            </div>
          </div>

          {(role === 'hotel' || role === 'owner') && (
            <p className="text-xs text-lake-500">
              New {role === 'hotel' ? 'hotel' : 'owner'} accounts and their boat listings are reviewed
              by the Kariba Lake Access team before they go live. You can set everything up in your
              portal right away while verification is pending.
            </p>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              <AlertCircle size={14} /> {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 transition-colors disabled:opacity-60"
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
        <p className="mt-2 text-center text-xs text-lake-400">
          Admin accounts are provisioned internally and are not available through this form.
        </p>
      </AuthCard>
    </PageTransition>
  );
}
