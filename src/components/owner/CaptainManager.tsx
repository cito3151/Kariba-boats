import { useState } from 'react';
import { Plus, Trash2, Anchor } from 'lucide-react';
import { createCaptain, deleteCaptain, type Captain } from '../../services/captains.service';
import { portalCard } from '../portal/styles';

// Owner's reusable captain roster. Parent owns the list and passes a reload callback.
export default function CaptainManager({
  ownerId, captains, onChanged,
}: { ownerId: string; captains: Captain[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inputClass = 'min-w-0 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';

  const add = async () => {
    if (!name.trim() || !phone.trim()) { setError('Enter a captain name and phone.'); return; }
    setBusy(true); setError('');
    try { await createCaptain(ownerId, name.trim(), phone.trim()); setName(''); setPhone(''); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not add captain.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setError('');
    try { await deleteCaptain(id); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove captain.'); }
    finally { setBusy(false); }
  };

  return (
    // A container, so the add row lays out by the card's width: it sits in a narrow
    // side column beside the bookings on a wide screen.
    <div className={`${portalCard} @container p-4 sm:p-5`}>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-lake-950">
        <Anchor size={18} /> Your captains
      </h2>
      <p className="mt-1.5 text-[15px] leading-normal text-lake-700">Add the captains who run your trips, then assign one to each confirmed booking.</p>

      {captains.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {captains.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-lake-50 px-3.5 py-2.5 text-base">
              <span className="min-w-0 break-words"><span className="font-semibold text-lake-900">{c.name}</span> <span className="whitespace-nowrap text-[15px] tabular-nums text-lake-700">{c.phone}</span></span>
              <button onClick={() => remove(c.id)} disabled={busy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                <Trash2 size={15} /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-2 @md:grid-cols-[1fr_1fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Captain name" aria-label="Captain name" className={inputClass} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Captain phone" className={inputClass} />
        <button onClick={add} disabled={busy}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-lake-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          <Plus size={16} /> Add
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
