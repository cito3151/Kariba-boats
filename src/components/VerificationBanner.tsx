import { Clock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../data/AuthContext';

// Shows a pending / rejected notice for owners and hotels. Renders nothing when
// the account is verified (or for tourists/admins, who are not gated).
// A white notice with a coloured left rule, so it still reads as a box on the
// lake-50 page background the portals sit on.
export default function VerificationBanner() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  if (currentUser.role !== 'owner' && currentUser.role !== 'hotel') return null;
  if (currentUser.verificationStatus === 'verified') return null;

  const isOwner = currentUser.role === 'owner';
  const target = isOwner ? 'submit boats for review' : 'book on behalf of guests';

  if (currentUser.verificationStatus === 'rejected') {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 border-l-4 border-l-red-600 bg-red-50 p-4 text-[15px] leading-normal text-red-700">
        <ShieldAlert size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0 break-words">
          <p className="text-base font-semibold">Your account was not approved</p>
          {currentUser.verificationNote && <p>{currentUser.verificationNote}</p>}
          <p className="mt-1">You cannot {target} until an administrator approves your account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-lake-100 border-l-4 border-l-lake-600 bg-white p-4 text-[15px] leading-normal text-lake-700 shadow-[0_1px_2px_rgb(13_37_50/0.06)]">
      <Clock size={20} className="mt-0.5 shrink-0 text-lake-600" />
      <div className="min-w-0">
        <p className="text-base font-semibold text-lake-950">Your account is under review</p>
        <p>
          You can set everything up now, but you cannot {target} until an administrator verifies your account.
        </p>
      </div>
    </div>
  );
}
