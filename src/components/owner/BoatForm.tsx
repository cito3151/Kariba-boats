import { useState } from 'react';
import type { BoatInput, BoatKind } from '../../services/boats.service';

const BOAT_TYPES: { value: BoatKind; label: string }[] = [
  { value: 'houseboat', label: 'Houseboat' },
  { value: 'speedboat', label: 'Speedboat' },
  { value: 'fishing', label: 'Fishing boat' },
  { value: 'cruiser', label: 'Cruiser' },
  { value: 'pontoon', label: 'Pontoon' },
];

const FUEL_POLICIES: { value: BoatInput['fuelPolicy']; label: string }[] = [
  { value: 'included', label: 'Fuel included' },
  { value: 'excluded', label: 'Fuel excluded' },
  { value: 'prepaid', label: 'Fuel prepaid' },
  { value: 'full_to_full', label: 'Full to full' },
];

const EMPTY: BoatInput = {
  name: '', boatType: 'fishing', capacity: 4, description: '', location: '',
  pricePerHour: null, pricePerDay: null, facilities: [], safetyEquipment: [],
  crewIncluded: true, fuelPolicy: 'included', registrationNumber: '',
  maintenanceIntervalHours: 100, accumulatedHours: 0, lastMaintenanceHours: 0,
};

const inputClass =
  'mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400';
const labelClass = 'text-xs font-medium text-lake-500';

function validate(v: BoatInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = v.name.trim();
  if (name.length < 2 || name.length > 80) errors.name = 'Name must be 2 to 80 characters.';
  if (!Number.isInteger(v.capacity) || v.capacity < 1 || v.capacity > 200)
    errors.capacity = 'Capacity must be a whole number from 1 to 200.';
  if (v.location.trim().length < 2) errors.location = 'Enter where the boat operates from.';
  const hasHour = v.pricePerHour != null && v.pricePerHour > 0;
  const hasDay = v.pricePerDay != null && v.pricePerDay > 0;
  if (!hasHour && !hasDay) errors.price = 'Set an hourly price, a daily price, or both.';
  if (!(v.maintenanceIntervalHours > 0))
    errors.maintenanceIntervalHours = 'Service interval must be greater than 0.';
  if (v.lastMaintenanceHours > v.accumulatedHours)
    errors.lastMaintenanceHours = 'Last service hours cannot exceed total hours.';
  return errors;
}

const toList = (s: string) =>
  s.split(',').map((x) => x.trim()).filter(Boolean);

export default function BoatForm({
  initial,
  onSubmit,
  submitLabel = 'Save',
}: {
  initial?: BoatInput;
  onSubmit: (input: BoatInput) => Promise<void> | void;
  submitLabel?: string;
}) {
  const [v, setV] = useState<BoatInput>(initial ?? EMPTY);
  const [facilitiesText, setFacilitiesText] = useState((initial?.facilities ?? []).join(', '));
  const [safetyText, setSafetyText] = useState((initial?.safetyEquipment ?? []).join(', '));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const set = <K extends keyof BoatInput>(key: K, val: BoatInput[K]) =>
    setV((prev) => ({ ...prev, [key]: val }));

  const numberOrNull = (raw: string) => (raw === '' ? null : Number(raw));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const payload: BoatInput = {
      ...v,
      name: v.name.trim(),
      location: v.location.trim(),
      registrationNumber: v.registrationNumber.trim(),
      facilities: toList(facilitiesText),
      safetyEquipment: toList(safetyText),
    };
    const found = validate(payload);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save this boat.');
    } finally {
      setBusy(false);
    }
  };

  const err = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Boat name</label>
          <input value={v.name} onChange={(e) => set('name', e.target.value)}
            className={inputClass} placeholder="e.g. Tiger Fish Explorer" />
          {err('name')}
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select value={v.boatType} onChange={(e) => set('boatType', e.target.value as BoatKind)}
            className={inputClass}>
            {BOAT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Guest capacity</label>
          <input type="number" min={1} max={200} value={v.capacity}
            onChange={(e) => set('capacity', Number(e.target.value))} className={inputClass} />
          {err('capacity')}
        </div>
        <div>
          <label className={labelClass}>Operates from</label>
          <input value={v.location} onChange={(e) => set('location', e.target.value)}
            className={inputClass} placeholder="e.g. Charara Harbour" />
          {err('location')}
        </div>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea value={v.description} onChange={(e) => set('description', e.target.value)}
          rows={3} className={inputClass} maxLength={2000}
          placeholder="What makes this boat and the experience special?" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Price per hour (USD)</label>
          <input type="number" min={0} step="0.01" value={v.pricePerHour ?? ''}
            onChange={(e) => set('pricePerHour', numberOrNull(e.target.value))}
            className={inputClass} placeholder="Leave blank if not offered" />
        </div>
        <div>
          <label className={labelClass}>Price per day (USD)</label>
          <input type="number" min={0} step="0.01" value={v.pricePerDay ?? ''}
            onChange={(e) => set('pricePerDay', numberOrNull(e.target.value))}
            className={inputClass} placeholder="Leave blank if not offered" />
        </div>
      </div>
      {err('price')}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Facilities (comma separated)</label>
          <input value={facilitiesText} onChange={(e) => setFacilitiesText(e.target.value)}
            className={inputClass} placeholder="Braai, Fridge, Sun deck, Toilet" />
        </div>
        <div>
          <label className={labelClass}>Safety equipment (comma separated)</label>
          <input value={safetyText} onChange={(e) => setSafetyText(e.target.value)}
            className={inputClass} placeholder="Life jackets, Fire extinguisher, First aid kit" />
        </div>
        <div>
          <label className={labelClass}>Fuel policy</label>
          <select value={v.fuelPolicy}
            onChange={(e) => set('fuelPolicy', e.target.value as BoatInput['fuelPolicy'])}
            className={inputClass}>
            {FUEL_POLICIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Registration number</label>
          <input value={v.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)}
            className={inputClass} placeholder="Optional" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-lake-700">
        <input type="checkbox" checked={v.crewIncluded}
          onChange={(e) => set('crewIncluded', e.target.checked)} className="h-4 w-4 rounded" />
        Crew or skipper is included
      </label>

      <div className="rounded-xl border border-lake-100 bg-lake-50/60 p-4">
        <p className="text-sm font-semibold text-lake-800">Maintenance tracking</p>
        <p className="mt-1 text-xs text-lake-500">
          Set how many operating hours the boat runs between services. If the boat already has hours
          on it, enter them here so alerts are accurate from day one.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Service interval (hours)</label>
            <input type="number" min={1} step="0.1" value={v.maintenanceIntervalHours}
              onChange={(e) => set('maintenanceIntervalHours', Number(e.target.value))}
              className={inputClass} />
            {err('maintenanceIntervalHours')}
          </div>
          <div>
            <label className={labelClass}>Total hours so far</label>
            <input type="number" min={0} step="0.1" value={v.accumulatedHours}
              onChange={(e) => set('accumulatedHours', Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Hours at last service</label>
            <input type="number" min={0} step="0.1" value={v.lastMaintenanceHours}
              onChange={(e) => set('lastMaintenanceHours', Number(e.target.value))} className={inputClass} />
            {err('lastMaintenanceHours')}
          </div>
        </div>
      </div>

      {submitError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{submitError}</p>
      )}

      <button type="submit" disabled={busy}
        className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 transition-colors disabled:opacity-60 sm:w-auto sm:px-6">
        {busy ? 'Saving' : submitLabel}
      </button>
    </form>
  );
}
