import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Trash2, Anchor, Pencil, Info } from 'lucide-react';
import { createCaptain, deleteCaptain, updateCaptain, type Captain } from '../../services/captains.service';
import { portalCard, portalButtonSecondary } from '../portal/styles';

const inputClass = 'w-full min-w-0 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';

// One captain being edited in place: name and phone, Save and Cancel, and the
// reminder that bookings already assigned keep what they were given.
function CaptainEditRow({
  captain, onSaved, onCancel,
}: { captain: Captain; onSaved: () => void; onCancel: () => void }) {
  const reduce = useReducedMotion();
  const [name, setName] = useState(captain.name);
  const [phone, setPhone] = useState(captain.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => { nameRef.current?.focus(); }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !phone.trim()) { setError('Enter a captain name and phone.'); return; }
    if (name.trim() === captain.name && phone.trim() === captain.phone) { onCancel(); return; }
    setBusy(true); setError('');
    try { await updateCaptain(captain.id, name.trim(), phone.trim()); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save the captain.'); }
    finally { setBusy(false); }
  };

  return (
    <motion.form
      onSubmit={save}
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onCancel(); }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.2, ease: 'easeOut' }}
      aria-label={`Edit ${captain.name}`}
      className="rounded-lg border border-lake-200 bg-lake-50 p-3.5"
    >
      <div className="grid gap-3 @md:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-name`} className="block text-sm font-semibold text-lake-800">Name</label>
          <input ref={nameRef} id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)}
            autoComplete="off" className={`${inputClass} mt-1.5`} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-phone`} className="block text-sm font-semibold text-lake-800">Phone</label>
          <input id={`${id}-phone`} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            autoComplete="off" className={`${inputClass} mt-1.5 tabular-nums`} />
        </div>
      </div>
      <p className="mt-2.5 flex items-start gap-1.5 text-sm leading-normal text-lake-700">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
        <span>Bookings this captain is already assigned to keep the old name and phone. Assign the captain again on those bookings to update them.</span>
      </p>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-lake-700 px-3.5 py-2.5 text-sm font-semibold text-white outline-none hover:bg-lake-800 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 disabled:opacity-50">
          {busy ? 'Saving' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={portalButtonSecondary}>Cancel</button>
      </div>
    </motion.form>
  );
}

// The team's reusable captain roster. Parent owns the list and passes a reload
// callback. Owners and managers maintain it; everyone else on the team reads it
// (captains_* policies, migration 40), so the edit controls are left out for them.
export default function CaptainManager({
  companyId, userId, captains, canManage, onChanged,
}: {
  companyId: string | null; userId: string; captains: Captain[]; canManage: boolean; onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());

  const add = async () => {
    if (!name.trim() || !phone.trim()) { setError('Enter a captain name and phone.'); return; }
    setBusy(true); setError('');
    if (!companyId) { setError('Your workspace has not loaded yet. Try again in a moment.'); return; }
    try { await createCaptain(companyId, userId, name.trim(), phone.trim()); setName(''); setPhone(''); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not add captain.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setError('');
    try { await deleteCaptain(id); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove captain.'); }
    finally { setBusy(false); }
  };

  // Closing the editor hands focus back to that captain's Edit button.
  const closeEditor = (id: string) => {
    setEditingId(null);
    requestAnimationFrame(() => editButtons.current.get(id)?.focus());
  };

  return (
    // A container, so the add row lays out by the card's width: it sits in a narrow
    // side column beside the bookings on a wide screen.
    <div className={`${portalCard} @container p-4 sm:p-5`}>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-lake-950">
        <Anchor size={18} /> Your captains
      </h2>
      <p className="mt-1.5 text-[15px] leading-normal text-lake-700">
        {canManage
          ? 'Add the captains who run your trips, then assign one to each confirmed booking.'
          : 'The captains who run your team’s trips. An owner or manager keeps this list up to date.'}
      </p>
      {!canManage && captains.length === 0 && (
        <p className="mt-3 rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] text-lake-700">No captains on the roster yet.</p>
      )}

      {captains.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {captains.map((c) => (
            <li key={c.id}>
              {editingId === c.id ? (
                <CaptainEditRow
                  captain={c}
                  onCancel={() => closeEditor(c.id)}
                  onSaved={() => { closeEditor(c.id); onChanged(); }}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-lake-50 px-3.5 py-2.5 text-base">
                  <span className="min-w-0 break-words"><span className="font-semibold text-lake-900">{c.name}</span> <span className="whitespace-nowrap text-[15px] tabular-nums text-lake-700">{c.phone}</span></span>
                  {canManage && <span className="flex shrink-0 items-center gap-1">
                    <button
                      ref={(el) => { if (el) editButtons.current.set(c.id, el); else editButtons.current.delete(c.id); }}
                      type="button" onClick={() => { setError(''); setEditingId(c.id); }} disabled={busy}
                      aria-label={`Edit ${c.name}`}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-lake-700 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-lake-500 disabled:opacity-50">
                      <Pencil size={15} aria-hidden /> Edit
                    </button>
                    <button type="button" onClick={() => remove(c.id)} disabled={busy}
                      aria-label={`Remove ${c.name}`}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50">
                      <Trash2 size={15} aria-hidden /> Remove
                    </button>
                  </span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && <div className="mt-3 grid gap-2 @md:grid-cols-[1fr_1fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Captain name" aria-label="Captain name" className={inputClass} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Captain phone" className={inputClass} />
        <button onClick={add} disabled={busy}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-lake-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          <Plus size={16} /> Add
        </button>
      </div>}
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
