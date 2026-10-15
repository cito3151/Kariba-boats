import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Building2, Hotel, Link2, MapPin, Pencil, Plus, Power, Unlink, Users } from 'lucide-react';
import Reveal from '../Reveal';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard, portalButtonSecondary, portalButtonDanger } from '../portal/styles';
import { adminButtonCommit } from './styles';
import { useAsync } from '../../hooks/useAsync';
import * as partners from '../../services/partners.service';
import type { PartnerKind, PartnerOrg, PartnerOrgInput, PartnerUser } from '../../services/partners.service';

// Hotels and travel agencies: create, edit, deactivate and reactivate the
// organisations, and link or unlink the hotel and agency accounts that book for
// them. There is no delete: bookings point at these rows. Deactivating stops new
// bookings for the organisation (migration 37) and keeps every past one.

const groupHeading = 'text-[13px] font-bold uppercase tracking-[0.06em] text-lake-700';
const labelClass = 'block text-sm font-medium text-lake-700';
const inputClass =
  'mt-1.5 w-full min-w-0 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';

const KIND_TEXT: Record<PartnerKind, { plural: string; one: string; a: string; heading: string }> = {
  hotel: { plural: 'hotels', one: 'hotel', a: 'a hotel', heading: 'Hotels and lodges' },
  agency: { plural: 'agencies', one: 'agency', a: 'an agency', heading: 'Travel agencies' },
};

function useFade() {
  const reduce = useReducedMotion();
  return reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
      initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 },
      transition: { duration: 0.2, ease: 'easeOut' as const },
    };
}

/** Name, location and commission, for both creating and editing. */
function OrgForm({
  kind, initial, submitLabel, onSubmit, onCancel,
}: {
  kind: PartnerKind; initial: PartnerOrgInput; submitLabel: string;
  onSubmit: (input: PartnerOrgInput) => Promise<void>; onCancel: () => void;
}) {
  const fade = useFade();
  const id = useId();
  const [name, setName] = useState(initial.name);
  const [location, setLocation] = useState(initial.location);
  const [commission, setCommission] = useState(String(initial.commissionRate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const input: PartnerOrgInput = { name, location, commissionRate: Number(commission) };
    const problem = partners.validateOrgInput(input);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { await onSubmit(input); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); setBusy(false); }
  };

  return (
    <motion.form {...fade} onSubmit={submit} noValidate
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onCancel(); }}
      className="rounded-lg bg-lake-50 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_8rem]">
        <div className="min-w-0">
          <label htmlFor={`${id}-name`} className={labelClass}>{kind === 'hotel' ? 'Hotel' : 'Agency'} name</label>
          <input ref={nameRef} id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-loc`} className={labelClass}>Location</label>
          <input id={`${id}-loc`} value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-com`} className={labelClass}>Commission %</label>
          <input id={`${id}-com`} type="number" inputMode="decimal" min={partners.COMMISSION_MIN} max={partners.COMMISSION_MAX} step="0.5"
            value={commission} onChange={(e) => setCommission(e.target.value)} className={`${inputClass} tabular-nums`} />
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={adminButtonCommit}>{busy ? 'Saving' : submitLabel}</button>
        <button type="button" onClick={onCancel} disabled={busy} className={portalButtonSecondary}>Cancel</button>
      </div>
    </motion.form>
  );
}

function OrgCard({
  org, users, allOrgs, onChanged,
}: { org: PartnerOrg; users: PartnerUser[]; allOrgs: PartnerOrg[]; onChanged: () => void }) {
  const fade = useFade();
  const text = KIND_TEXT[org.kind];
  const [mode, setMode] = useState<'none' | 'edit' | 'deactivate'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkChoice, setLinkChoice] = useState('');
  // The actions row mounts again only after the edit form's exit fade, so the
  // Edit details button takes focus back when it mounts, not on a timer.
  const refocusEdit = useRef(false);
  const linkId = useId();

  const linked = users.filter((u) => u.orgId === org.id);
  const others = users.filter((u) => u.orgId !== org.id);
  const orgName = (id: string | null) => allOrgs.find((o) => o.id === id)?.name;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); setMode('none'); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  const closeEdit = () => { refocusEdit.current = true; setMode('none'); };

  return (
    <Reveal as="li" className={`${portalCard} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{org.name}</h4>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] leading-normal text-lake-700">
            <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden /> {org.location}</span>
            <span><span className="tabular-nums">{org.commissionRate}</span>% commission</span>
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${org.isActive ? 'bg-lake-100 text-lake-700' : 'bg-gray-100 text-gray-700'}`}>
          {org.isActive ? 'Active' : 'Deactivated'}
        </span>
      </div>

      {!org.isActive && (
        <p className="mt-2 text-[15px] leading-normal text-lake-700">
          Its accounts cannot make new bookings. Past bookings are kept.
        </p>
      )}

      {/* Linked accounts */}
      <div className="mt-3 border-t border-lake-100 pt-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">
          <Users size={14} aria-hidden /> Linked accounts (<span className="tabular-nums">{linked.length}</span>)
        </p>
        {linked.length === 0 ? (
          <p className="mt-1 text-[15px] leading-normal text-lake-700">No {text.one} accounts are linked yet.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {linked.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-lake-50 px-3.5 py-2">
                <span className="min-w-0 break-words text-base text-lake-900">
                  <span className="font-semibold">{u.fullName}</span>
                  {u.businessName && <span className="text-[15px] text-lake-700"> · {u.businessName}</span>}
                  <span className="text-[15px] text-lake-700"> · {u.verificationStatus}</span>
                </span>
                <button type="button" disabled={busy}
                  onClick={() => run(() => partners.linkPartnerUser(u.id, org.kind, null))}
                  aria-label={`Unlink ${u.fullName} from ${org.name}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50">
                  <Unlink size={15} aria-hidden /> Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        {others.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-56">
              <label htmlFor={linkId} className={labelClass}>Link {text.a} account</label>
              <select id={linkId} value={linkChoice} onChange={(e) => setLinkChoice(e.target.value)} className={inputClass}>
                <option value="">Choose an account</option>
                {others.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}{u.businessName ? ` (${u.businessName})` : ''}{u.orgId ? ` - now linked to ${orgName(u.orgId) ?? `another ${text.one}`}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" disabled={busy || !linkChoice} className={portalButtonSecondary}
              onClick={() => run(async () => { await partners.linkPartnerUser(linkChoice, org.kind, org.id); setLinkChoice(''); })}>
              <Link2 size={15} aria-hidden /> Link
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>}

      <div className="mt-4 border-t border-lake-100 pt-3.5">
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'edit' ? (
            <OrgForm key="edit" kind={org.kind} submitLabel="Save changes"
              initial={{ name: org.name, location: org.location, commissionRate: org.commissionRate }}
              onCancel={closeEdit}
              onSubmit={async (input) => {
                await partners.updatePartnerOrg(org.kind, org.id, input);
                closeEdit(); onChanged();
              }}
            />
          ) : mode === 'deactivate' ? (
            <motion.div key="deactivate" {...fade} className="rounded-lg border border-red-200 bg-red-50/60 p-3 sm:p-4">
              <p className="text-base leading-relaxed text-lake-900">
                Deactivate <span className="font-semibold">{org.name}</span>? Its {linked.length === 1 ? 'account' : 'accounts'} can
                no longer make new bookings. Bookings already made, and the records, are kept, and you can reactivate it at any time.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} className={portalButtonDanger}
                  onClick={() => run(() => partners.setPartnerOrgActive(org.kind, org.id, false))}>
                  {busy ? 'Deactivating' : 'Deactivate'}
                </button>
                <button type="button" disabled={busy} onClick={() => setMode('none')} className={portalButtonSecondary}>Keep active</button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="actions" {...fade} className="flex flex-wrap gap-2">
              <button
                ref={(el) => { if (el && refocusEdit.current) { refocusEdit.current = false; el.focus(); } }}
                type="button" disabled={busy} onClick={() => { setError(''); setMode('edit'); }} className={portalButtonSecondary}>
                <Pencil size={15} aria-hidden /> Edit details
              </button>
              {org.isActive ? (
                <button type="button" disabled={busy} onClick={() => { setError(''); setMode('deactivate'); }} className={portalButtonDanger}>
                  <Power size={15} aria-hidden /> Deactivate
                </button>
              ) : (
                <button type="button" disabled={busy} className={portalButtonSecondary}
                  onClick={() => run(() => partners.setPartnerOrgActive(org.kind, org.id, true))}>
                  <Power size={15} aria-hidden /> {busy ? 'Reactivating' : 'Reactivate'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reveal>
  );
}

function KindSection({
  kind, orgs, users, onChanged,
}: { kind: PartnerKind; orgs: PartnerOrg[]; users: PartnerUser[]; onChanged: () => void }) {
  const text = KIND_TEXT[kind];
  const [creating, setCreating] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const kindUsers = users.filter((u) => u.kind === kind);
  const unlinked = kindUsers.filter((u) => !u.orgId);
  const Icon = kind === 'hotel' ? Hotel : Building2;

  const closeCreate = () => { setCreating(false); requestAnimationFrame(() => addButton.current?.focus()); };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className={`${groupHeading} flex items-center gap-1.5`}>
          <Icon size={15} aria-hidden /> {text.heading} (<span className="tabular-nums">{orgs.length}</span>)
        </h3>
        {!creating && (
          <button ref={addButton} type="button" onClick={() => setCreating(true)} className={portalButtonSecondary}>
            <Plus size={15} aria-hidden /> Add {text.one}
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-3">
          <OrgForm kind={kind} submitLabel={`Add ${text.one}`}
            initial={{ name: '', location: '', commissionRate: 8 }}
            onCancel={closeCreate}
            onSubmit={async (input) => {
              await partners.createPartnerOrg(kind, { ...input, isActive: true });
              closeCreate(); onChanged();
            }}
          />
        </div>
      )}

      {unlinked.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[15px] leading-normal text-amber-900">
          {unlinked.length} {text.one} {unlinked.length === 1 ? 'account is' : 'accounts are'} not linked to any {text.one}
          {' '}({unlinked.map((u) => u.fullName).join(', ')}). An unlinked account cannot book.
        </p>
      )}

      {orgs.length === 0 ? (
        <EmptyState large title={`No ${text.plural} yet`}
          hint={`Add one here, or verify ${text.a} account under Unverified owners/hotels.`} />
      ) : (
        <ul className="space-y-3">
          {orgs.map((o) => (
            <OrgCard key={o.id} org={o} users={kindUsers} allOrgs={orgs} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function PartnerOrgs() {
  const hotels = useAsync(() => partners.listPartnerOrgs('hotel'), []);
  const agencies = useAsync(() => partners.listPartnerOrgs('agency'), []);
  const users = useAsync(partners.listPartnerUsers, []);

  const reloadAll = () => { hotels.reload(); agencies.reload(); users.reload(); };

  const firstLoad = (hotels.loading && !hotels.data) || (agencies.loading && !agencies.data) || (users.loading && !users.data);
  if (firstLoad) return <LoadingState large label="Loading hotels and agencies" />;
  const error = hotels.error ?? agencies.error ?? users.error;
  if (error) return <ErrorState large message={error} onRetry={reloadAll} />;

  return (
    <div className="space-y-10">
      <KindSection kind="hotel" orgs={hotels.data ?? []} users={users.data ?? []} onChanged={reloadAll} />
      <KindSection kind="agency" orgs={agencies.data ?? []} users={users.data ?? []} onChanged={reloadAll} />
    </div>
  );
}
