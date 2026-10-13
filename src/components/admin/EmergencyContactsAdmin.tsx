import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard, portalButtonPrimary, portalButtonDanger } from '../portal/styles';
import { adminButtonCommit } from './styles';
import { useAsync } from '../../hooks/useAsync';
import { staggerContainer, staggerItem } from '../motion';
import {
  listEmergencyContacts, createEmergencyContact, updateEmergencyContact, deleteEmergencyContact,
  type EmergencyContact,
} from '../../services/emergency.service';

const inputClass = 'min-w-0 rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';

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
    <motion.div variants={staggerItem} className={`${portalCard} p-4 sm:p-5`}>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className={inputClass} />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Lake rescue)" aria-label="Role" className={inputClass} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Phone" className={`${inputClass} tabular-nums`} />
      </div>
      {error && <p className="mt-2 text-[15px] font-medium text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy || !dirty || !name.trim() || !role.trim() || !phone.trim()}
          onClick={() => run(() => updateEmergencyContact(contact.id, { name: name.trim(), role: role.trim(), phone: phone.trim(), sortOrder: index }))}
          className={adminButtonCommit}>
          {busy ? 'Saving' : 'Save'}
        </button>
        <button disabled={busy} onClick={() => run(() => deleteEmergencyContact(contact.id))} className={portalButtonDanger}>
          <Trash2 size={15} /> Remove
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
  const reduce = useReducedMotion();

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

  if (loading) return <LoadingState large label="Loading emergency contacts" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      {/* Add contact is this view's one orange action; each row's Save is navy. */}
      <div className={`${portalCard} border-l-4 border-l-sunset-500 p-4 sm:p-5`}>
        <h3 className="text-lg font-bold tracking-[-0.01em] text-lake-950">Add an emergency contact</h3>
        <p className="mt-1 text-[15px] leading-normal text-lake-700">These show to tourists and hotels on their trips and on each boat page.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className={inputClass} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Lake rescue)" aria-label="Role" className={inputClass} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Phone" className={`${inputClass} tabular-nums`} />
        </div>
        {addError && <p className="mt-2 text-[15px] font-medium text-red-700">{addError}</p>}
        <button onClick={add} disabled={busy} className={`${portalButtonPrimary} mt-3`}>
          <Plus size={16} /> Add contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState large title="No emergency contacts yet" hint="Add the real lake rescue, medical, and platform contacts above." />
      ) : (
        <motion.div variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show" className="space-y-3">
          {contacts.map((c, i) => <Row key={c.id} contact={c} index={i} onSaved={reload} />)}
        </motion.div>
      )}
    </div>
  );
}
