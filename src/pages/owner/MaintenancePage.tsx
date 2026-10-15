import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import OwnerPortalPage from '../../components/owner/OwnerPortalPage';
import RoleNotice from '../../components/owner/RoleNotice';
import PortalSection from '../../components/portal/PortalSection';
import { portalCard } from '../../components/portal/styles';
import MaintenanceCard from '../../components/owner/MaintenanceCard';
import HoursLog from '../../components/maintenance/HoursLog';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import Reveal from '../../components/Reveal';
import { useAuth } from '../../data/AuthContext';
import { useOperatorAccess } from '../../data/operatorAccess';
import { useAsync } from '../../hooks/useAsync';
import { useCompanyAsync } from '../../hooks/useCompanyAsync';
import * as boats from '../../services/boats.service';
import * as maint from '../../services/maintenance.service';
import type { OwnerBoat, MaintenanceStatus } from '../../services/boats.service';

const ORDER: Record<MaintenanceStatus, number> = { overdue: 0, due: 1, approaching: 2, ok: 3 };

// The hours log comes back with the time it was read, so which entries are
// still inside the owner's 24-hour correction window is decided from data, not
// from a clock read during render.
async function loadHours(boatId: string) {
  const entries = await maint.listHours(boatId);
  return { entries, readAt: Date.now() };
}

function BoatHistory({ boatId, userId, onChanged }: { boatId: string; userId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: records, reload: reloadRecords } = useAsync(() => maint.listMaintenance(boatId), [boatId, open ? 1 : 0]);
  const { data: hours, reload: reloadHours } = useAsync(() => loadHours(boatId), [boatId, open ? 1 : 0]);
  const panelId = useId();

  return (
    <div className={`${portalCard} mt-2`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3.5 text-left text-base font-semibold text-lake-800 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lake-500">
        Service history and hours log
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div id={panelId} className="border-t border-lake-100 p-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">Maintenance records</p>
          {(records ?? []).length === 0 ? (
            <p className="mt-1.5 text-base text-lake-700">No maintenance recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(records ?? []).map((r) => (
                <li key={r.id} className="rounded-lg bg-lake-50 px-3.5 py-2.5 text-base">
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <span className="min-w-0 break-words font-semibold text-lake-900">{r.description}</span>
                    <span className="tabular-nums text-lake-700">{r.performedAt}</span>
                  </div>
                  <p className="mt-0.5 text-[15px] text-lake-700">
                    At {r.hoursAtService.toFixed(1)} hours
                    {r.serviceProvider ? `, ${r.serviceProvider}` : ''}
                    {r.cost != null ? `, $${r.cost.toFixed(2)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">Hours log</p>
          <p className="mt-1 text-[15px] leading-normal text-lake-700">
            Logged a wrong figure? You can correct an entry for 24 hours after logging it, as long as no service has been recorded since.
          </p>
          <HoursLog
            entries={hours?.entries ?? []}
            actionLabel="Correct this entry"
            canVoid={(h) => !!hours && maint.canOwnerCorrect(h, userId, records ?? [], hours.readAt)}
            onVoided={() => { reloadHours(); reloadRecords(); onChanged(); }}
          />
        </div>
      )}
    </div>
  );
}

export default function MaintenancePage() {
  const { currentUser } = useAuth();
  const access = useOperatorAccess();
  const userId = currentUser?.id ?? '';
  const { data, loading, error, reload } = useCompanyAsync(boats.listOwnerBoats);
  const canLog = access.can('log_hours');
  const canService = access.can('complete_maintenance');

  const sorted = [...(data ?? [])].sort(
    (a, b) => ORDER[a.maintenanceStatus] - ORDER[b.maintenanceStatus],
  );

  return (
    <OwnerPortalPage
      title="Maintenance"
      crumb="Maintenance"
      subtitle="Log operating hours after each trip. Boats that go overdue are hidden from tourist search until you record a service."
    >
      {access.role === 'staff' && (
        <RoleNotice role={access.role}>
          You can log operating hours and correct your own entries. An owner or manager records completed services.
        </RoleNotice>
      )}

      <PortalSection title="Your fleet" description="Most urgent first.">
        {loading && <LoadingState large label="Loading maintenance" />}
        {error && <ErrorState large message={error} onRetry={reload} />}
        {!loading && !error && sorted.length === 0 && (
          <EmptyState large title="No boats yet" hint="Register a boat to start tracking its hours." />
        )}
        {/* Two boats a row on a wide screen; items-start so opening one boat's
            history does not stretch its neighbour. */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {sorted.map((boat: OwnerBoat) => (
            <Reveal key={boat.id} className="min-w-0">
              <MaintenanceCard boat={boat} canLog={canLog} canService={canService} onChanged={reload} />
              <BoatHistory boatId={boat.id} userId={userId} onChanged={reload} />
            </Reveal>
          ))}
        </div>
      </PortalSection>
    </OwnerPortalPage>
  );
}
