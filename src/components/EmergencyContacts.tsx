import { LifeBuoy, Phone } from 'lucide-react';
import { useAsync } from '../hooks/useAsync';
import { listEmergencyContacts } from '../services/emergency.service';

// Read-only safety card. Renders nothing until the admin has added contacts.
export default function EmergencyContacts({ compact = false }: { compact?: boolean }) {
  const { data } = useAsync(listEmergencyContacts, []);
  const contacts = data ?? [];
  if (contacts.length === 0) return null;

  return (
    <div className={`rounded-2xl border border-lake-100 bg-white ${compact ? 'p-4' : 'p-5'}`}>
      <h3 className="flex items-center gap-2 font-semibold text-lake-950">
        <LifeBuoy size={16} className="text-sunset-500" /> Emergency contacts
      </h3>
      <ul className="mt-3 space-y-2">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-lake-900">{c.name}</p>
              <p className="text-xs text-lake-500">{c.role}</p>
            </div>
            <a href={`tel:${c.phone}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-lake-50 px-3 py-1.5 text-xs font-semibold text-lake-700 hover:bg-lake-100">
              <Phone size={13} /> {c.phone}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
