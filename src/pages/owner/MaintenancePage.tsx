import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import PageTransition from '../../components/PageTransition';
import MaintenanceCard from '../../components/owner/MaintenanceCard';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import { useAuth } from '../../data/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import * as boats from '../../services/boats.service';
import * as maint from '../../services/maintenance.service';
import type { OwnerBoat, MaintenanceStatus } from '../../services/boats.service';

const ORDER: Record<MaintenanceStatus, number> = { overdue: 0, due: 1, approaching: 2, ok: 3 };

function BoatHistory({ boatId }: { boatId: string }) {
  const [open, setOpen] = useState(false);
  const { data: records } = useAsync(() => maint.listMaintenance(boatId), [boatId, open ? 1 : 0]);
  const { data: hours } = useAsync(() => maint.listHours(boatId), [boatId, open ? 1 : 0]);

  return (
    <div className="mt-2 rounded-xl border border-lake-100 bg-white">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-lake-700">
        Service history and hours log
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="border-t border-lake-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-lake-400">Maintenance records</p>
          {(records ?? []).length === 0 ? (
            <p className="mt-1 text-sm text-lake-500">No maintenance recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(records ?? []).map((r) => (
                <li key={r.id} className="rounded-lg bg-lake-50 px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-lake-800">{r.description}</span>
                    <span className="tabular-nums text-lake-500">{r.performedAt}</span>
                  </div>
                  <p className="text-xs text-lake-500">
                    At {r.hoursAtService.toFixed(1)} hours
                    {r.serviceProvider ? `, ${r.serviceProvider}` : ''}
                    {r.cost != null ? `, $${r.cost.toFixed(2)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-lake-400">Hours log</p>
          {(hours ?? []).length === 0 ? (
            <p className="mt-1 text-sm text-lake-500">No hours logged yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {(hours ?? []).map((h) => (
                <li key={h.id} className="flex justify-between gap-2 text-sm">
                  <span className="text-lake-700">
                    +{h.hours.toFixed(1)} h{h.note ? <span className="text-lake-400">, {h.note}</span> : ''}
                  </span>
                  <span className="tabular-nums text-lake-500">total {h.readingAfter.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function MaintenancePage() {
  const { currentUser } = useAuth();
  const ownerId = currentUser?.id ?? '';
  const { data, loading, error, reload } = useAsync(() => boats.listOwnerBoats(ownerId), [ownerId]);

  const sorted = [...(data ?? [])].sort(
    (a, b) => ORDER[a.maintenanceStatus] - ORDER[b.maintenanceStatus],
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <Link to="/owner" className="inline-flex items-center gap-1.5 text-sm text-lake-600 hover:text-lake-900">
          <ArrowLeft size={15} /> Back to your boats
        </Link>
        <h1 className="mt-3 font-display text-2xl font-medium text-lake-950">Maintenance</h1>
        <p className="mt-1 text-sm text-lake-500">
          Log operating hours after each trip. Boats that go overdue are hidden from tourist search
          until you record a service.
        </p>

        <div className="mt-6 space-y-6">
          {loading && <LoadingState label="Loading maintenance" />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {!loading && !error && sorted.length === 0 && (
            <EmptyState title="No boats yet" hint="Register a boat to start tracking its hours." />
          )}
          {sorted.map((boat: OwnerBoat) => (
            <div key={boat.id}>
              <MaintenanceCard boat={boat} onChanged={reload} />
              <BoatHistory boatId={boat.id} />
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
