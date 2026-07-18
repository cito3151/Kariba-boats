import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Mail } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import PageTransition from '../components/PageTransition';
import { useAuth } from '../data/AuthContext';

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    requestPasswordReset(email);
    setSent(true);
  };

  return (
    <PageTransition>
      <AuthCard title="Reset your password" subtitle="We will help you get back into your account">
        {!sent ? (
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
            <button
              type="submit"
              className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 transition-colors"
            >
              Send reset link
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
              If an account exists for <span className="font-medium text-lake-900">{email}</span>, a
              password reset link has been sent.
            </p>

            <div className="mt-5 rounded-lg bg-lake-50 p-3 text-xs text-lake-600 text-left flex items-start gap-2">
              <Mail size={14} className="mt-0.5 shrink-0 text-lake-500" />
              <span>
                This is a demo environment with no real email delivery. Use the button below to continue
                to the reset screen as if you had clicked the emailed link.
              </span>
            </div>

            <button
              onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email)}`)}
              className="mt-4 w-full rounded-lg bg-lake-700 py-2.5 text-sm font-semibold text-white hover:bg-lake-800 transition-colors"
            >
              Continue to reset password
            </button>
          </motion.div>
        )}

        <p className="mt-5 text-center text-sm text-lake-500">
          Remembered your password?{' '}
          <Link to="/login" className="font-semibold text-lake-700 hover:text-lake-900">
            Log in
          </Link>
        </p>
      </AuthCard>
    </PageTransition>
  );
}
