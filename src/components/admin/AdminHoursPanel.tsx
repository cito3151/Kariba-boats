import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import HoursLog from '../maintenance/HoursLog';
import { LoadingState, ErrorState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import * as maint from '../../services/maintenance.service';
import type { OwnerBoat } from '../../services/boats.service';

const STATUS_TEXT: Record<string, string> = {
  ok: 'on schedule', approaching: 'service approaching', due: 'service due', overdue: 'still overdue',
};

/**
 * A boat's hours log behind a toggle, for the admin's maintenance views. An
 * administrator may void any entry (void_operating_hours): the fix for a
 * mistyped figure that pushed a boat overdue and out of search. `onVoided` gets
 * a one-line summary to show, then the caller reloads its boats.
 */
export default function AdminHoursPanel({
  boat: b, onVoided,
}: {
  boat: OwnerBoat;
  onVoided: (summary: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { data: hours, loading, error, reload } = useAsync(
    () => (open ? maint.listHours(b.id) : Promise.resolve(null)), [b.id, open],
  );

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
        className="mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-sm text-sm font-semibold text-lake-700 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
        {open ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
        {open ? 'Hide hours log' : 'Check the hours log'}
      </button>
      {open && (
        <div id={panelId} className="mt-2 rounded-lg border border-lake-100 bg-white p-3.5">
          {loading && !hours && <LoadingState large label="Loading the hours log" />}
          {error && <ErrorState large message={error} onRetry={reload} />}
          {hours && (
            <HoursLog entries={hours} actionLabel="Void entry" canVoid={() => true}
              onVoided={(result) => {
                reload();
                const status = result.maintenanceStatus ?? '';
                onVoided(`Entry voided. ${b.name} now stands at ${result.accumulatedHours.toFixed(1)} hours, ${
                  STATUS_TEXT[status] ?? status}.${
                  b.maintenanceStatus === 'overdue' && status !== 'overdue'
                    ? ' It is no longer hidden from search for being overdue.' : ''}`);
              }} />
          )}
        </div>
      )}
    </>
  );
}
