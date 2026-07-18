import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import PageTransition from '../components/PageTransition';
import { useAuth } from '../data/AuthContext';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailFromLink = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailFromLink);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = (e: React.FormEvent) => {
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

    resetPassword(email, password);
    setDone(true);
  };

  return (
    <PageTransition>
      <AuthCard title="Set a new password" subtitle="Choose a new password for your account">
        {!done ? (
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
              <label className="text-xs font-medium text-lake-500">New password</label>
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
              <label className="text-xs font-medium text-lake-500">Confirm new password</label>
              <input
                required
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                placeholder="Re-enter new password"
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
              className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 transition-colors"
            >
              Set new password
            </button>
          </form>
        ) : (
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
              <CheckCircle2 size={44} className="text-emerald-500" />
            </motion.div>
            <p className="mt-3 text-sm text-lake-600">
              Your password has been updated. You can now log in with your new password.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="mt-4 w-full rounded-lg bg-lake-700 py-2.5 text-sm font-semibold text-white hover:bg-lake-800 transition-colors"
            >
              Go to login
            </button>
          </motion.div>
        )}

        {!done && (
          <p className="mt-5 text-center text-sm text-lake-500">
            <Link to="/login" className="font-semibold text-lake-700 hover:text-lake-900">
              Back to login
            </Link>
          </p>
        )}
      </AuthCard>
    </PageTransition>
  );
}
