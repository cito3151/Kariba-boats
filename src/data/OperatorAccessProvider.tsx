import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { OperatorAccessContext, type OperatorAccess } from './operatorAccess';
import * as companies from '../services/companies.service';
import * as team from '../services/team.service';
import { roleCan, type Permission } from '../services/permissions';
import type { Workspace } from '../services/companies.service';
import type { TeamMember } from '../services/team.service';

interface Loaded { workspace: Workspace | null; members: TeamMember[] }

/**
 * Loads the operator's workspace, role and team once per signed-in owner account.
 * Renders its children straight away for everyone else; only owner accounts query.
 */
export default function OperatorAccessProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.role === 'owner' ? currentUser.id : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) { setLoaded(null); setLoading(false); setError(null); return; }
    let active = true;
    setLoading(true); setError(null);
    (async () => {
      const workspace = await companies.getMyWorkspace(userId);
      // The team list is a nicety for names and the accountable owner; a failure
      // to read it must not lock anyone out of the portal.
      const members = workspace
        ? await team.listMembers(workspace.company.id).catch(() => [] as TeamMember[])
        : [];
      return { workspace, members };
    })()
      .then((r) => { if (active) setLoaded(r); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load your workspace.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<OperatorAccess>(() => {
    const role = loaded?.workspace?.role ?? null;
    const members = loaded?.members ?? [];
    return {
      loading,
      error,
      company: loaded?.workspace?.company ?? null,
      role,
      members,
      // Before the team loads, or if it cannot be read, a sole owner is their own
      // accountable owner, which is what every operator was before teams existed.
      accountableOwnerId: team.accountableOwner(members)?.profileId
        ?? (role === 'owner' ? userId : null),
      can: (permission: Permission) => roleCan(role, permission),
      reload,
    };
  }, [loaded, loading, error, reload, userId]);

  return <OperatorAccessContext.Provider value={value}>{children}</OperatorAccessContext.Provider>;
}
