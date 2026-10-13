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
      <h3 className={`flex items-center gap-2 text-lake-950 ${compact ? 'font-semibold' : 'text-xl font-bold tracking-[-0.015em]'}`}>
        <LifeBuoy size={compact ? 16 : 20} className={compact ? 'text-sunset-500' : 'text-sunset-700'} /> Emergency contacts
      </h3>
      <ul className={`mt-3 ${compact ? 'space-y-2' : 'space-y-3'}`}>
        {contacts.map((c) => (
          <li key={c.id} className={`flex items-center justify-between gap-3 ${compact ? 'text-sm' : 'text-base'}`}>
            <div className="min-w-0">
              <p className={compact ? 'font-medium text-lake-900' : 'font-semibold text-lake-900'}>{c.name}</p>
              <p className={compact ? 'text-xs text-lake-500' : 'text-[15px] text-lake-700'}>{c.role}</p>
            </div>
            <a href={`tel:${c.phone}`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-lake-50 font-semibold text-lake-700 hover:bg-lake-100 ${compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2.5 text-sm tabular-nums'}`}>
              <Phone size={compact ? 13 : 15} /> {c.phone}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
