import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';
import { ROLES, type CompanyMemberRole } from './permissions';

/**
 * The team behind a workspace: list, add by e-mail, change role, remove, leave.
 * Every write is a SECURITY DEFINER RPC (migration 40) that checks the caller's
 * role and refuses to leave a team without an owner; the client holds no write
 * grant on company_members at all.
 */
export interface TeamMember {
  profileId: string;
  name: string;
  /** Shown to owners, and to each member for themselves; null otherwise. */
  email: string | null;
  role: CompanyMemberRole;
  addedAt: string;
  isSelf: boolean;
}

function asRole(value: unknown): CompanyMemberRole {
  // 'staff' rather than anything higher: an unknown role must never read as more.
  return ROLES.includes(value as CompanyMemberRole) ? (value as CompanyMemberRole) : 'staff';
}

/** Owners first, then managers, then staff; longest-serving first within a role. */
export async function listMembers(companyId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('list_company_members', { p_company_id: companyId });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r) => ({
    profileId: r.profile_id, name: r.full_name, email: r.email ?? null,
    role: asRole(r.member_role), addedAt: r.added_at, isSelf: r.is_self,
  }));
}

export async function addMember(companyId: string, email: string, role: CompanyMemberRole): Promise<void> {
  const { error } = await supabase.rpc('add_company_member', {
    p_company_id: companyId, p_email: email.trim(), p_role: role,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function setMemberRole(companyId: string, profileId: string, role: CompanyMemberRole): Promise<void> {
  const { error } = await supabase.rpc('set_company_member_role', {
    p_company_id: companyId, p_profile_id: profileId, p_role: role,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function removeMember(companyId: string, profileId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_company_member', {
    p_company_id: companyId, p_profile_id: profileId,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function leaveTeam(companyId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_company', { p_company_id: companyId });
  if (error) throw new Error(humanizeError(error.message));
}

/**
 * The team's accountable owner: the longest-standing owner, who holds the team's
 * boats (stamp_boat_company) and whose account verification still gates
 * submitting a boat for review. listMembers returns owners first, oldest first.
 */
export function accountableOwner(members: TeamMember[]): TeamMember | null {
  return members.find((m) => m.role === 'owner') ?? null;
}

/** How many owners the team has, for the last-owner messages. */
export function ownerCount(members: TeamMember[]): number {
  return members.filter((m) => m.role === 'owner').length;
}
