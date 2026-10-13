import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import Reveal from '../Reveal';
import PhotoBackdrop from '../PhotoBackdrop';
import { photos } from '../../data/photos';

interface Group {
  key: string;
  name: string;
  count: number;
}

/**
 * Where listed boats depart from. Everything shown comes from the `location`
 * field on the live listings: names are grouped ignoring case and extra
 * spaces, and nothing is added or described beyond the name and the count.
 *
 * Set as a photo band, the way MSC sets its destination blocks: a houseboat on
 * Kariba's own shore under a navy scrim, with each departure point on a white
 * card. The photo sits behind the whole band rather than one per card, because a
 * stock photo beside a place name would read as a picture of that place. The
 * scrim is the portal headers' (92% navy at the left, 75% at the right), so the
 * heading is 7:1 or better and the lake-100 subtitle 5.7:1 or better whatever
 * the photo does; the cards carry their own text on white.
 *
 * The photo drifts in parallax behind the band; the heading rises in, then the
 * cards follow in a wave as they reach the screen.
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
    <section className="relative overflow-hidden bg-lake-950" aria-labelledby="departures-heading">
      <PhotoBackdrop photo={photos.karibaShore} parallax="band" />
      <div aria-hidden className="absolute inset-0 bg-linear-to-r from-lake-950/92 via-lake-950/84 to-lake-950/75" />
      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <Reveal>
          <h2
            id="departures-heading"
            className="text-2xl font-extrabold uppercase tracking-[0.04em] text-white"
          >
            Where trips depart
          </h2>
          <p className="mt-1 text-[15px] text-lake-100">The departure points of the boats listed now.</p>
        </Reveal>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Reveal
              as="li"
              key={g.key}
              className="flex items-center justify-between gap-3 rounded-md bg-white px-4 py-3.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]"
            >
              <span className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-lake-950">
                <MapPin size={15} className="shrink-0 text-sunset-600" aria-hidden />
                <span className="truncate">{g.name}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-lake-600">
                {g.count} {g.count === 1 ? 'boat' : 'boats'}
              </span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
