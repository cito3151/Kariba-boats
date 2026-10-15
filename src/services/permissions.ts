/**
 * What each team role may do. Mirrors company_permission_min_role() in the database
 * (migration 40, ADR-002) so the portal only offers actions the server will accept.
 * The server is the authority: hiding a button here is a courtesy, not the control.
 */
export type CompanyMemberRole = 'owner' | 'manager' | 'staff';

export type Permission =
  | 'view'
  | 'log_hours'
  | 'assign_captains'
  | 'edit_boats'
  | 'manage_bookings'
  | 'complete_maintenance'
  | 'manage_captains'
  | 'reply_reviews'
  | 'manage_documents'
  | 'edit_company'
  | 'manage_members'
  | 'delete_boats';

const MIN_ROLE: Record<Permission, CompanyMemberRole> = {
  view: 'staff',
  log_hours: 'staff',
  assign_captains: 'staff',
  edit_boats: 'manager',
  manage_bookings: 'manager',
  complete_maintenance: 'manager',
  manage_captains: 'manager',
  reply_reviews: 'manager',
  manage_documents: 'manager',
  edit_company: 'owner',
  manage_members: 'owner',
  delete_boats: 'owner',
};

const RANK: Record<CompanyMemberRole, number> = { owner: 3, manager: 2, staff: 1 };

export const ROLES: readonly CompanyMemberRole[] = ['owner', 'manager', 'staff'];

export function roleCan(role: CompanyMemberRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[MIN_ROLE[permission]];
}

/** Who to ask, in plain words, when a role is too low for something. */
export function whoCan(permission: Permission): string {
  return MIN_ROLE[permission] === 'owner' ? 'a team owner' : 'a team owner or manager';
}

export const ROLE_LABELS: Record<CompanyMemberRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

/** One line per role, for the team section and the role picker. */
export const ROLE_SUMMARIES: Record<CompanyMemberRole, string> = {
  owner: 'Everything, including company details, the team and deleting boats.',
  manager: 'Edits boats, handles bookings, captains, services, reviews and documents.',
  staff: 'Sees everything, logs hours and assigns captains.',
};
