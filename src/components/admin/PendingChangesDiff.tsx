import type { OwnerBoat } from '../../services/boats.service';

const LABELS: Record<string, string> = {
  name: 'Name', boat_type: 'Type', capacity: 'Capacity',
  price_per_hour: 'Price per hour', price_per_day: 'Price per day',
  safety_equipment: 'Safety equipment', crew_included: 'Crew included',
  registration_number: 'Registration',
};

const CURRENT: Record<string, (b: OwnerBoat) => unknown> = {
  name: (b) => b.name, boat_type: (b) => b.boatType, capacity: (b) => b.capacity,
  price_per_hour: (b) => b.pricePerHour, price_per_day: (b) => b.pricePerDay,
  safety_equipment: (b) => b.safetyEquipment.join(', '),
  crew_included: (b) => (b.crewIncluded ? 'Yes' : 'No'),
  registration_number: (b) => b.registrationNumber,
};

const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === null ? 'None' : String(v));

export default function PendingChangesDiff({ boat }: { boat: OwnerBoat }) {
  if (!boat.pendingChanges) return null;
  const keys = Object.keys(boat.pendingChanges);
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
      <p className="text-[15px] font-semibold leading-normal text-amber-900">
        Proposed changes, live listing still shows the approved values
      </p>
      {/* The table scrolls inside this box on a phone, never the page. */}
      <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[28rem] text-[15px] leading-snug">
        <thead>
          <tr className="text-left text-amber-800">
            <th className="py-1.5 pr-3 text-[13px] font-semibold uppercase tracking-[0.05em]">Field</th>
            <th className="py-1.5 pr-3 text-[13px] font-semibold uppercase tracking-[0.05em]">Currently live</th>
            <th className="py-1.5 text-[13px] font-semibold uppercase tracking-[0.05em]">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-amber-200">
              <td className="py-2 pr-3 align-top font-semibold text-lake-900">{LABELS[k] ?? k}</td>
              <td className="py-2 pr-3 align-top text-lake-700">{show(CURRENT[k]?.(boat))}</td>
              <td className="py-2 align-top font-semibold text-lake-950">
                {show((boat.pendingChanges as Record<string, unknown>)[k])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
