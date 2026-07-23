import { useState } from 'react';
import { Plus, Trash2, Anchor } from 'lucide-react';
import { createCaptain, deleteCaptain, type Captain } from '../../services/captains.service';

// Owner's reusable captain roster. Parent owns the list and passes a reload callback.
export default function CaptainManager({
  ownerId, captains, onChanged,
}: { ownerId: string; captains: Captain[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inputClass = 'rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400';

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
    <div className="rounded-2xl border border-lake-100 bg-lake-50/60 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-lake-800">
        <Anchor size={15} /> Your captains
      </h2>
      <p className="mt-1 text-xs text-lake-500">Add the captains who run your trips, then assign one to each confirmed booking.</p>

      {captains.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {captains.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
              <span className="min-w-0"><span className="font-medium text-lake-900">{c.name}</span> <span className="text-xs text-lake-500">{c.phone}</span></span>
              <button onClick={() => remove(c.id)} disabled={busy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">
                <Trash2 size={13} /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Captain name" className={inputClass} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
        <button onClick={add} disabled={busy}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-lake-700 px-4 py-2 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          <Plus size={14} /> Add
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
