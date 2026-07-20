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
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-900">
        Proposed changes, live listing still shows the approved values
      </p>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-amber-800">
            <th className="py-1 font-medium">Field</th>
            <th className="py-1 font-medium">Currently live</th>
            <th className="py-1 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-amber-200">
              <td className="py-1 pr-2 font-medium text-lake-800">{LABELS[k] ?? k}</td>
              <td className="py-1 pr-2 text-lake-600">{show(CURRENT[k]?.(boat))}</td>
              <td className="py-1 font-semibold text-lake-950">
                {show((boat.pendingChanges as Record<string, unknown>)[k])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
