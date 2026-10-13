import { LifeBuoy, Phone } from 'lucide-react';
import { useAsync } from '../hooks/useAsync';
import { listEmergencyContacts } from '../services/emergency.service';
import { portalCard, portalButtonSecondary } from './portal/styles';

// Read-only safety card. Renders nothing until the admin has added contacts.
// The compact form is the public boat page's sidebar card; the full form is a
// portal card beside the tourist's trips, where it heads its own column (h2).
export default function EmergencyContacts({ compact = false }: { compact?: boolean }) {
  const { data } = useAsync(listEmergencyContacts, []);
  const contacts = data ?? [];
  if (contacts.length === 0) return null;

  const Heading = compact ? 'h3' : 'h2';

  return (
    <div className={compact ? 'rounded-2xl border border-lake-100 bg-white p-4' : `${portalCard} p-4 sm:p-5`}>
      <Heading className={`flex items-center gap-2 text-lake-950 ${compact ? 'font-semibold' : 'text-lg font-bold tracking-[-0.01em]'}`}>
        <LifeBuoy size={compact ? 16 : 20} className={compact ? 'text-sunset-500' : 'text-sunset-700'} /> Emergency contacts
      </Heading>
      <ul className={`mt-3 ${compact ? 'space-y-2' : 'space-y-3'}`}>
        {contacts.map((c) => (
          <li key={c.id} className={`flex items-center justify-between gap-3 ${compact ? 'text-sm' : 'flex-wrap text-base'}`}>
            <div className="min-w-0">
              <p className={compact ? 'font-medium text-lake-900' : 'break-words font-semibold text-lake-900'}>{c.name}</p>
              <p className={compact ? 'text-xs text-lake-500' : 'text-[15px] text-lake-700'}>{c.role}</p>
            </div>
            <a href={`tel:${c.phone}`}
              className={compact
                ? 'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-lake-50 px-3 py-1.5 text-xs font-semibold text-lake-700 hover:bg-lake-100'
                : `${portalButtonSecondary} shrink-0 tabular-nums`}>
              <Phone size={compact ? 13 : 15} /> {c.phone}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
