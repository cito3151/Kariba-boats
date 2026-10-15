import { Eye } from 'lucide-react';
import type { ReactNode } from 'react';
import { ROLE_LABELS, type CompanyMemberRole } from '../../services/permissions';

/**
 * Says, once at the top of a page, what the signed-in member can and cannot do
 * here, so a staff member reading a page without its usual buttons knows it is
 * their role and not a fault. The server enforces the same rules.
 * lake-900 on white is well over 7:1.
 */
export default function RoleNotice({
  role, children,
}: { role: CompanyMemberRole | null; children: ReactNode }) {
  if (!role) return null;
  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-3 rounded-lg border border-lake-100 border-l-4 border-l-lake-500 bg-white p-4 text-[15px] leading-normal text-lake-800 shadow-[0_1px_2px_rgb(13_37_50/0.06)]"
    >
      <Eye size={20} className="mt-0.5 shrink-0 text-lake-600" aria-hidden />
      <div className="min-w-0 break-words">
        <p className="text-base font-semibold text-lake-950">You are on this team as {ROLE_LABELS[role].toLowerCase()}</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </div>
  );
}
