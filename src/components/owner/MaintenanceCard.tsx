import { useState } from 'react';
import { Gauge, Wrench, Clock } from 'lucide-react';
import * as maint from '../../services/maintenance.service';
import type { OwnerBoat, MaintenanceStatus } from '../../services/boats.service';

const BAR_COLOR: Record<MaintenanceStatus, string> = {
  ok: 'bg-lake-500',
  approaching: 'bg-sunset-400',
  due: 'bg-red-400',
  overdue: 'bg-red-600',
};

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  ok: 'On schedule',
  approaching: 'Service approaching',
  due: 'Service due',
  overdue: 'Service overdue',
};

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-lake-500">{label}</p>
      <p className="tabular-nums font-semibold text-lake-900">{value}</p>
    </div>
  );
}

export default function MaintenanceCard({
  boat, onChanged,
}: {
  boat: OwnerBoat; onChanged: () => void;
}) {
  const [mode, setMode] = useState<'none' | 'hours' | 'service'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');

  const [description, setDescription] = useState('');
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState('');
  const [provider, setProvider] = useState('');

  const usedInCycle = boat.accumulatedHours - boat.lastMaintenanceHours;
  const pct = Math.max(0, Math.min(100, (usedInCycle / boat.maintenanceIntervalHours) * 100));
  const remaining = boat.hoursRemaining;

  const logHours = async () => {
    const h = Number(hours);
    if (!(h >= 0.5 && h <= 24)) { setError('Enter hours between 0.5 and 24.'); return; }
    setBusy(true); setError('');
    try {
      await maint.logHours(boat.id, h, note || undefined);
      setHours(''); setNote(''); setMode('none');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log hours.');
    } finally { setBusy(false); }
  };

  const completeService = async () => {
    if (description.trim().length < 3) { setError('Describe the work done (at least 3 characters).'); return; }
    setBusy(true); setError('');
    try {
      await maint.completeMaintenance(boat.id, {
        description: description.trim(),
        performedAt,
        cost: cost === '' ? null : Number(cost),
        serviceProvider: provider || null,
      });
      setDescription(''); setCost(''); setProvider(''); setMode('none');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record maintenance.');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lake-950">{boat.name}</h3>
          <p className="text-xs text-lake-500">{STATUS_LABEL[boat.maintenanceStatus]}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          boat.maintenanceStatus === 'ok' ? 'bg-lake-100 text-lake-700'
          : boat.maintenanceStatus === 'approaching' ? 'bg-sunset-100 text-sunset-700'
          : 'bg-red-100 text-red-700'
        }`}>
          {STATUS_LABEL[boat.maintenanceStatus]}
        </span>
      </div>

      {boat.maintenanceStatus === 'overdue' && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          This boat is hidden from tourist search until maintenance is recorded.
        </p>
      )}

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-lake-100">
        <div className={`h-full rounded-full ${BAR_COLOR[boat.maintenanceStatus]}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Total hours" value={boat.accumulatedHours.toFixed(1)} />
        <Figure label="Last service at" value={boat.lastMaintenanceHours.toFixed(1)} />
        <Figure label="Next due at" value={boat.nextMaintenanceHours.toFixed(1)} />
        {remaining < 0 ? (
          <div className="min-w-0">
            <p className="truncate text-[11px] text-lake-500">Remaining</p>
            <p className="tabular-nums font-semibold text-red-600">{Math.abs(remaining).toFixed(1)} hours overdue</p>
          </div>
        ) : (
          <Figure label="Remaining" value={`${remaining.toFixed(1)} h`} />
        )}
      </div>

      {mode === 'none' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => { setMode('hours'); setError(''); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-lake-700 px-3 py-2 text-xs font-semibold text-white hover:bg-lake-800">
            <Clock size={14} /> Log hours
          </button>
          <button onClick={() => { setMode('service'); setError(''); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lake-200 px-3 py-2 text-xs font-semibold text-lake-700 hover:bg-lake-50">
            <Wrench size={14} /> Mark maintenance complete
          </button>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {mode === 'hours' && (
        <div className="mt-4 space-y-3 rounded-xl border border-lake-100 bg-lake-50/50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-lake-800"><Clock size={15} /> Log operating hours</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-lake-500">Hours this trip (0.5 to 24)</label>
              <input type="number" min={0.5} max={24} step="0.5" value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-lake-500">Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400"
                placeholder="Sunset cruise, calm water" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={logHours} disabled={busy}
              className="rounded-lg bg-lake-700 px-4 py-2 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
              {busy ? 'Saving' : 'Save hours'}
            </button>
            <button onClick={() => { setMode('none'); setError(''); }}
              className="rounded-lg border border-lake-200 px-4 py-2 text-xs font-medium text-lake-600 hover:bg-lake-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'service' && (
        <div className="mt-4 space-y-3 rounded-xl border border-lake-100 bg-lake-50/50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-lake-800"><Wrench size={15} /> Record maintenance</p>
          <div>
            <label className="text-xs font-medium text-lake-500">What was done</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400"
              placeholder="Engine service, oil and filter change" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-lake-500">Date</label>
              <input type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-lake-500">Cost (USD, optional)</label>
              <input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-lake-500">Service provider (optional)</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)}
                className="mt-1 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400"
                placeholder="Kariba Marine" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={completeService} disabled={busy}
              className="rounded-lg bg-lake-700 px-4 py-2 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
              {busy ? 'Saving' : 'Record maintenance'}
            </button>
            <button onClick={() => { setMode('none'); setError(''); }}
              className="rounded-lg border border-lake-200 px-4 py-2 text-xs font-medium text-lake-600 hover:bg-lake-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-lake-400">
        <Gauge size={12} /> Interval {boat.maintenanceIntervalHours.toFixed(0)} hours
      </div>
    </div>
  );
}
