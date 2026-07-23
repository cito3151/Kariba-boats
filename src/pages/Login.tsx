import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Info, Anchor, ClipboardCheck, Building2, ShieldCheck, Briefcase } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import PageTransition from '../components/PageTransition';
import { useAuth } from '../data/AuthContext';

type Role = 'tourist' | 'owner' | 'hotel' | 'admin' | 'agency';

const PORTALS: { key: Role; label: string; home: string; icon: typeof Anchor }[] = [
  { key: 'tourist', label: 'Tourist', home: '/', icon: Anchor },
  { key: 'owner', label: 'Boat owner', home: '/owner', icon: ClipboardCheck },
  { key: 'hotel', label: 'Hotel or Lodge', home: '/hotel', icon: Building2 },
  { key: 'agency', label: 'Travel agency', home: '/agency', icon: Briefcase },
  { key: 'admin', label: 'Admin', home: '/admin', icon: ShieldCheck },
];

const roleHome: Record<Role, string> = { tourist: '/', owner: '/owner', hotel: '/hotel', agency: '/agency', admin: '/admin' };
const roleLabel: Record<Role, string> = { tourist: 'Browse Boats', owner: 'the Owner portal', hotel: 'the Hotel portal', agency: 'the Travel agency portal', admin: 'the Admin panel' };

export default function Login() {
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [portal, setPortal] = useState<Role>('tourist');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState<Role | null>(null);

  const from = (location.state as { from?: string } | null)?.from;

  // The account role is not known until the session resolves. If an explicit
  // "from" target exists, honour it. Otherwise route to the account's real
  // portal, and if that differs from the selected tab, show a note first.
  useEffect(() => {
    if (!currentUser) return;
    if (from) { navigate(from, { replace: true }); return; }
    if (currentUser.role === portal) {
      navigate(roleHome[currentUser.role], { replace: true });
    } else {
      setMismatch(currentUser.role);
    }
  }, [currentUser, from, portal, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const selectedLabel = PORTALS.find((p) => p.key === portal)!.label;

  if (mismatch) {
    return (
      <PageTransition>
        <AuthCard title="Signed in" subtitle="Taking you to the right place">
          <div className="rounded-lg bg-lake-50 p-4 text-sm text-lake-700">
            This is a <span className="font-semibold capitalize">{mismatch}</span> account, not a{' '}
            {selectedLabel.toLowerCase()} account. We will take you to {roleLabel[mismatch]}.
          </div>
          <button
            onClick={() => navigate(roleHome[mismatch], { replace: true })}
            className="mt-4 w-full rounded-lg bg-lake-700 py-2.5 text-sm font-semibold text-white hover:bg-lake-800 transition-colors"
          >
            Continue
          </button>
        </AuthCard>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <AuthCard title="Log in" subtitle={`Log in to the ${selectedLabel} portal`}>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {PORTALS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPortal(p.key)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition-colors ${
                portal === p.key
                  ? 'border-lake-600 bg-lake-50 text-lake-800'
                  : 'border-lake-100 text-lake-500 hover:bg-lake-50'
              }`}
            >
              <p.icon size={16} />
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
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
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-lake-500">Password</label>
              <Link to="/forgot-password" className="text-xs font-medium text-lake-600 hover:text-lake-800">
                Forgot password?
              </Link>
            </div>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
              placeholder="Enter your password"
            />
          </div>

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
            {busy ? 'Logging in' : `Log in to ${selectedLabel}`}
          </button>
        </form>

        <div className="mt-5 rounded-lg bg-lake-50 p-3 text-xs text-lake-600">
          <p className="flex items-center gap-1.5 font-semibold text-lake-700">
            <Info size={13} /> Which portal do I pick?
          </p>
          <p className="mt-1.5">
            Your account decides where you land. The tabs above just frame it: pick Tourist to book
            trips, Owner to list and manage boats, Hotel to book for guests, Admin for oversight.
            If you sign in with a different account type, we route you to the right place.
          </p>
        </div>

        <p className="mt-5 text-center text-sm text-lake-500">
          New to Kariba Lake Access?{' '}
          <Link to="/signup" className="font-semibold text-lake-700 hover:text-lake-900">
            Create an account
          </Link>
        </p>
      </AuthCard>
    </PageTransition>
  );
}
