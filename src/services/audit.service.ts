import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface AuditEntry {
  id: string; createdAt: string;
  actorEmail: string | null; actorName: string | null; actorRole: string | null;
  action: 'insert' | 'update' | 'delete';
  entityType: string; entityId: string | null; label: string | null;
  changed: Record<string, unknown> | null;
}

export async function listAudit(
  opts: { entityType?: string; action?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc('admin_list_audit', {
    p_entity_type: opts.entityType ?? undefined,
    p_action: opts.action ?? undefined,
    p_limit: opts.limit ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => ({
    id: r.id, createdAt: r.created_at, actorEmail: r.actor_email, actorName: r.actor_name,
    actorRole: r.actor_role, action: r.action, entityType: r.entity_type, entityId: r.entity_id,
    label: r.label, changed: r.changed,
  }));
}
