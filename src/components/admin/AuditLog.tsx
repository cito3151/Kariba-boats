import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { staggerContainer, staggerItem } from '../motion';
import { portalCard } from '../portal/styles';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import { listAudit } from '../../services/audit.service';
import type { AuditEntry } from '../../services/audit.service';

const ENTITY_TYPES = ['boats', 'bookings', 'profiles', 'boat_images', 'reviews', 'hotels', 'agencies', 'consent_records', 'legal_documents'];
const ACTIONS = ['insert', 'update', 'delete'];

// White, not lake-50: the filters sit on the lake-50 page, not inside a card.
const filterClass =
  'min-w-0 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';

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
  if (!changed) return <p className="text-[15px] text-lake-700">No details.</p>;

  if (entry.action === 'update') {
    return (
      <ul className="space-y-1 text-[15px] leading-normal text-lake-700">
        {Object.entries(changed).map(([field, val]) => {
          const diff = val as { old?: unknown; new?: unknown };
          return (
            <li key={field} className="break-words">
              <span className="font-semibold text-lake-900">{field}</span>: {scalar(diff.old)}
              {' -> '}{scalar(diff.new)}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="space-y-1 text-[15px] leading-normal text-lake-700">
      {Object.entries(changed)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => (
          <li key={k} className="break-words"><span className="font-semibold text-lake-900">{k}</span>: {scalar(v)}</li>
        ))}
    </ul>
  );
}

// One entry of the log: a divided row in the log's single card, the way a
// statement lists its lines, that opens to show what changed.
function Row({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.li variants={staggerItem}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-lake-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lake-500">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${ACTION_CHIP[entry.action]}`}>{entry.action}</span>
            <span className="text-base font-semibold text-lake-950">{entry.entityType}</span>
            {entry.label && <span className="min-w-0 truncate text-base text-lake-700">{entry.label}</span>}
          </div>
          <p className="mt-1 break-words text-sm text-lake-700">
            <span className="tabular-nums">{new Date(entry.createdAt).toLocaleString()}</span> · {entry.actorEmail || 'system'}
            {entry.actorRole ? ` (${entry.actorRole})` : ''}
          </p>
        </div>
        {open ? <ChevronUp size={18} className="shrink-0 text-lake-600" /> : <ChevronDown size={18} className="shrink-0 text-lake-600" />}
      </button>
      {open && <div className="mx-4 mb-3.5 border-t border-lake-100 pt-3"><ChangeDetails entry={entry} /></div>}
    </motion.li>
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
  const reduce = useReducedMotion();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
          aria-label="Filter by entity" className={filterClass}>
          <option value="">All entities</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action" className={filterClass}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {loading && <LoadingState large label="Loading activity" />}
      {error && <ErrorState large message={error} onRetry={reload} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState large title="No activity yet" hint="Changes across the platform will appear here as they happen." />
      )}
      {rows.length > 0 && (
        <motion.ul variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show"
          className={`${portalCard} divide-y divide-lake-100 overflow-hidden`}>
          {rows.map((e) => <Row key={e.id} entry={e} />)}
        </motion.ul>
      )}
    </div>
  );
}
