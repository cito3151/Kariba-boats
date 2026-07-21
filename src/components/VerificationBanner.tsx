import { Clock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../data/AuthContext';

// Shows a pending / rejected notice for owners and hotels. Renders nothing when
// the account is verified (or for tourists/admins, who are not gated).
export default function VerificationBanner() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  if (currentUser.role !== 'owner' && currentUser.role !== 'hotel') return null;
  if (currentUser.verificationStatus === 'verified') return null;

  const isOwner = currentUser.role === 'owner';
  const target = isOwner ? 'submit boats for review' : 'book on behalf of guests';

  if (currentUser.verificationStatus === 'rejected') {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Your account was not approved</p>
          {currentUser.verificationNote && <p>{currentUser.verificationNote}</p>}
          <p className="mt-1 text-xs">You cannot {target} until an administrator approves your account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl bg-lake-50 p-4 text-sm text-lake-700">
      <Clock size={18} className="mt-0.5 shrink-0 text-lake-500" />
      <div>
        <p className="font-semibold">Your account is under review</p>
        <p className="text-xs">
          You can set everything up now, but you cannot {target} until an administrator verifies your account.
        </p>
      </div>
    </div>
  );
}
