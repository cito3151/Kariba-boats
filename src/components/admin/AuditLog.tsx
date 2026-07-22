import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import { listAudit } from '../../services/audit.service';
import type { AuditEntry } from '../../services/audit.service';

const ENTITY_TYPES = ['boats', 'bookings', 'profiles', 'boat_images', 'reviews', 'hotels'];
const ACTIONS = ['insert', 'update', 'delete'];

const ACTION_CHIP: Record<AuditEntry['action'], string> = {
  insert: 'bg-lake-100 text-lake-700',
  update: 'bg-amber-100 text-amber-800',
  delete: 'bg-red-100 text-red-700',
};

function scalar(v: unknown): string {
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function ChangeDetails({ entry }: { entry: AuditEntry }) {
  const changed = entry.changed;
  if (!changed) return <p className="text-xs text-lake-400">No details.</p>;

  if (entry.action === 'update') {
    return (
      <ul className="space-y-0.5 text-xs text-lake-600">
        {Object.entries(changed).map(([field, val]) => {
          const diff = val as { old?: unknown; new?: unknown };
          return (
            <li key={field}>
              <span className="font-medium text-lake-800">{field}</span>: {scalar(diff.old)}
              {' -> '}{scalar(diff.new)}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="space-y-0.5 text-xs text-lake-600">
      {Object.entries(changed)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => (
          <li key={k}><span className="font-medium text-lake-800">{k}</span>: {scalar(v)}</li>
        ))}
    </ul>
  );
}

function Row({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-lake-100 bg-white p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACTION_CHIP[entry.action]}`}>{entry.action}</span>
            <span className="text-sm font-medium text-lake-950">{entry.entityType}</span>
            {entry.label && <span className="truncate text-sm text-lake-600">{entry.label}</span>}
          </div>
          <p className="mt-0.5 text-xs text-lake-500">
            {new Date(entry.createdAt).toLocaleString()} · {entry.actorEmail || 'system'}
            {entry.actorRole ? ` (${entry.actorRole})` : ''}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="shrink-0 text-lake-400" /> : <ChevronDown size={16} className="shrink-0 text-lake-400" />}
      </button>
      {open && <div className="mt-2 border-t border-lake-100 pt-2"><ChangeDetails entry={entry} /></div>}
    </div>
  );
}

export default function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const { data, loading, error, reload } = useAsync(
    () => listAudit({ entityType: entityType || undefined, action: action || undefined, limit: 200 }),
    [entityType, action],
  );

  const rows = data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
          className="rounded-lg border border-lake-100 bg-lake-50 px-3 py-1.5 text-sm outline-none focus:border-lake-400">
          <option value="">All entities</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="rounded-lg border border-lake-100 bg-lake-50 px-3 py-1.5 text-sm outline-none focus:border-lake-400">
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {loading && <LoadingState label="Loading activity" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="No activity yet" hint="Changes across the platform will appear here as they happen." />
      )}
      {rows.map((e) => <Row key={e.id} entry={e} />)}
    </div>
  );
}
