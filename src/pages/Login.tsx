import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Info } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import PageTransition from '../components/PageTransition';
import { useAuth } from '../data/AuthContext';

const roleHome: Record<string, string> = {
  tourist: '/',
  owner: '/owner',
  hotel: '/hotel',
  admin: '/admin',
};

export default function Login() {
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  // The profile role is not known until the session resolves, so navigate here
  // once currentUser arrives (unless we already have an explicit "from" target).
  useEffect(() => {
    if (currentUser && !from) navigate(roleHome[currentUser.role] ?? '/', { replace: true });
  }, [currentUser, from, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      if (from) navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition>
      <AuthCard title="Log in" subtitle="Welcome back to Kariba Lake Access">
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
            {busy ? 'Logging in' : 'Log in'}
          </button>
        </form>

        <div className="mt-5 rounded-lg bg-lake-50 p-3 text-xs text-lake-600">
          <p className="flex items-center gap-1.5 font-semibold text-lake-700">
            <Info size={13} /> Demo accounts
          </p>
          <ul className="mt-1.5 space-y-1">
            <li>Tourist: tourist@kariba.com / tourist123</li>
            <li>Hotel: caribbea@kariba.com / hotel123</li>
            <li>Owner: tigerfish@kariba.com / operator123</li>
            <li>Admin: admin@kariba.com / admin123</li>
          </ul>
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
