import { LifeBuoy, Phone } from 'lucide-react';
import { useAsync } from '../hooks/useAsync';
import { listEmergencyContacts } from '../services/emergency.service';
import { portalCard, portalButtonSecondary } from './portal/styles';
import Reveal from './Reveal';

// Read-only safety card. Renders nothing until the admin has added contacts, and
// rises in when they have loaded (it mounts only then, so the rise is seen).
// The compact form is the public boat page's card, under its safety checklist,
// where it is a section of the page (h2) in that page's grammar; the full form
// is a portal card beside the tourist's trips, where it heads its own column.
export default function EmergencyContacts({ compact = false }: { compact?: boolean }) {
  const { data } = useAsync(listEmergencyContacts, []);
  const contacts = data ?? [];
  if (contacts.length === 0) return null;

  return (
    <Reveal className={`${portalCard} ${compact ? 'p-5 sm:p-7' : 'p-4 sm:p-5'}`}>
      {compact ? (
        <>
          <span aria-hidden className="block h-1 w-10 rounded-full bg-sunset-500" />
          <h2 className="mt-3 flex items-center gap-2 text-xl font-extrabold uppercase tracking-[0.04em] text-lake-950 sm:text-2xl">
            <LifeBuoy size={22} className="shrink-0 text-sunset-700" aria-hidden /> Emergency contacts
          </h2>
        </>
      ) : (
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-lake-950">
          <LifeBuoy size={20} className="text-sunset-700" /> Emergency contacts
        </h2>
      )}
      <ul className={compact ? 'mt-4 divide-y divide-lake-100' : 'mt-3 space-y-3'}>
        {contacts.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center justify-between gap-3 text-base ${compact ? 'py-3 first:pt-0 last:pb-0' : ''}`}>
            <div className="min-w-0">
              <p className="break-words font-semibold text-lake-900">{c.name}</p>
              <p className="text-[15px] text-lake-700">{c.role}</p>
            </div>
            <a href={`tel:${c.phone}`} className={`${portalButtonSecondary} shrink-0 tabular-nums`}>
              <Phone size={15} /> {c.phone}
            </a>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
