import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import { staggerContainer, staggerItem } from '../motion';
import {
  listEmergencyContacts, createEmergencyContact, updateEmergencyContact, deleteEmergencyContact,
  type EmergencyContact,
} from '../../services/emergency.service';

const inputClass = 'rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400';

function Row({ contact, index, onSaved }: { contact: EmergencyContact; index: number; onSaved: () => void }) {
  const [name, setName] = useState(contact.name);
  const [role, setRole] = useState(contact.role);
  const [phone, setPhone] = useState(contact.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = name !== contact.name || role !== contact.role || phone !== contact.phone;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  return (
    <motion.div variants={staggerItem}
      className="rounded-xl border border-lake-100 bg-white p-3 transition-shadow hover:shadow-md">
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inputClass} />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Lake rescue)" className={inputClass} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button disabled={busy || !dirty || !name.trim() || !role.trim() || !phone.trim()}
          onClick={() => run(() => updateEmergencyContact(contact.id, { name: name.trim(), role: role.trim(), phone: phone.trim(), sortOrder: index }))}
          className="rounded-lg bg-lake-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          {busy ? 'Saving' : 'Save'}
        </button>
        <button disabled={busy} onClick={() => run(() => deleteEmergencyContact(contact.id))}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </motion.div>
  );
}

export default function EmergencyContactsAdmin() {
  const { data, loading, error, reload } = useAsync(listEmergencyContacts, []);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState('');

  const contacts = data ?? [];

  const add = async () => {
    if (!name.trim() || !role.trim() || !phone.trim()) { setAddError('Enter a name, role, and phone.'); return; }
    setBusy(true); setAddError('');
    try {
      await createEmergencyContact({ name: name.trim(), role: role.trim(), phone: phone.trim(), sortOrder: contacts.length });
      setName(''); setRole(''); setPhone(''); reload();
    } catch (e) { setAddError(e instanceof Error ? e.message : 'Could not add contact.'); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingState label="Loading emergency contacts" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-lake-100 bg-lake-50/60 p-4">
        <p className="text-sm font-semibold text-lake-800">Add an emergency contact</p>
        <p className="mt-1 text-xs text-lake-500">These show to tourists and hotels on their trips and on each boat page.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inputClass} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Lake rescue)" className={inputClass} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
        </div>
        {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
        <button onClick={add} disabled={busy}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-sunset-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sunset-600 disabled:opacity-50">
          <Plus size={14} /> Add contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState title="No emergency contacts yet" hint="Add the real lake rescue, medical, and platform contacts above." />
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
          {contacts.map((c, i) => <Row key={c.id} contact={c} index={i} onSaved={reload} />)}
        </motion.div>
      )}
    </div>
  );
}
