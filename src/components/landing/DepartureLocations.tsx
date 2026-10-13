import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import Reveal from '../Reveal';

interface Group {
  key: string;
  name: string;
  count: number;
}

/**
 * Where listed boats depart from. Everything shown comes from the `location`
 * field on the live listings: names are grouped ignoring case and extra
 * spaces, and nothing is added or described beyond the name and the count.
 */
export default function DepartureLocations({ locations }: { locations: string[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const raw of locations) {
      const name = raw.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, name, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [locations]);

  if (groups.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="departures-heading">
      <Reveal>
        <h2
          id="departures-heading"
          className="text-2xl font-extrabold uppercase tracking-[0.04em] text-lake-950"
        >
          Where trips depart
        </h2>
        <p className="mt-1 text-sm text-lake-600">The departure points of the boats listed now.</p>
        <ul className="mt-6 grid grid-cols-1 gap-x-10 border-t-2 border-lake-950 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li
              key={g.key}
              className="flex items-center justify-between gap-3 border-b border-lake-100 py-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-lake-950">
                <MapPin size={15} className="shrink-0 text-lake-400" aria-hidden />
                <span className="truncate">{g.name}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-lake-600">
                {g.count} {g.count === 1 ? 'boat' : 'boats'}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
