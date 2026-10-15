import { createContext, useContext } from 'react';
import type { Company } from '../services/companies.service';
import type { CompanyMemberRole, Permission } from '../services/permissions';
import type { TeamMember } from '../services/team.service';

/**
 * The signed-in operator's workspace, their role on it and the team, loaded once
 * for the whole owner portal by OperatorAccessProvider. Every owner page reads its
 * company id and its permissions from here instead of from the profile, so a
 * manager or staff member sees the team's boats rather than an empty portal.
 */
export interface OperatorAccess {
  /** True until the first load answers (and while a reload runs). */
  loading: boolean;
  error: string | null;
  company: Company | null;
  role: CompanyMemberRole | null;
  /** Empty when the team could not be read; the role still comes from the membership row. */
  members: TeamMember[];
  /** The longest-standing owner: holds the team's boats and their account verification gates submitting. */
  accountableOwnerId: string | null;
  can: (permission: Permission) => boolean;
  reload: () => void;
}

export const OperatorAccessContext = createContext<OperatorAccess | null>(null);

export function useOperatorAccess(): OperatorAccess {
  const ctx = useContext(OperatorAccessContext);
  if (!ctx) throw new Error('useOperatorAccess must be used within OperatorAccessProvider');
  return ctx;
}
