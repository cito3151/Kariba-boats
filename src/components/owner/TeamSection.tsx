import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { UserPlus, UserMinus, LogOut, Users, Info } from 'lucide-react';
import PortalSection from '../portal/PortalSection';
import {
  portalCard, portalButtonPrimary, portalButtonSecondary, portalButtonDanger,
} from '../portal/styles';
import * as team from '../../services/team.service';
import {
  ROLES, ROLE_LABELS, ROLE_SUMMARIES, roleCan, type CompanyMemberRole,
} from '../../services/permissions';
import type { Company } from '../../services/companies.service';
import type { TeamMember } from '../../services/team.service';

const inputClass =
  'mt-1.5 w-full min-w-0 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500 focus-visible:ring-2 focus-visible:ring-lake-500/30';

// lake-800 on lake-100, amber-900 on amber-100, lake-900 on lake-50: all above 7:1.
const ROLE_CHIP: Record<CompanyMemberRole, string> = {
  owner: 'bg-lake-100 text-lake-800',
  manager: 'bg-amber-100 text-amber-900',
  staff: 'bg-lake-50 text-lake-900 ring-1 ring-lake-200',
};

/** A small confirm panel that unfolds under the row, or just fades under reduced motion. */
function Unfold({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.22, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

function MemberRow({
  member, company, canManage, owners, onChanged,
}: {
  member: TeamMember; company: Company; canManage: boolean; owners: number; onChanged: () => void;
}) {
  const [role, setRole] = useState<CompanyMemberRole>(member.role);
  const [confirming, setConfirming] = useState<'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const selectId = useId();
  const lastOwner = member.role === 'owner' && owners <= 1;

  useEffect(() => { setRole(member.role); }, [member.role]);
  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  const saveRole = async () => {
    setBusy(true); setError('');
    try { await team.setMemberRole(company.id, member.profileId, role); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not change the role.'); setRole(member.role); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setError('');
    try { await team.removeMember(company.id, member.profileId); setConfirming(null); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove this member.'); }
    finally { setBusy(false); }
  };

  return (
    <li className="rounded-lg border border-lake-100 bg-white p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-lake-950">
            {member.name}
            {member.isSelf && <span className="ml-1.5 text-[15px] font-medium text-lake-700">(you)</span>}
          </p>
          {member.email && <p className="break-all text-[15px] text-lake-700">{member.email}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${ROLE_CHIP[member.role]}`}>
          {ROLE_LABELS[member.role]}
        </span>
      </div>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-40">
            <label htmlFor={selectId} className="block text-sm font-medium text-lake-700">Role</label>
            <select
              id={selectId} value={role} disabled={busy || lastOwner}
              onChange={(e) => { setRole(e.target.value as CompanyMemberRole); setError(''); }}
              className={`${inputClass} disabled:bg-lake-50 disabled:text-lake-700`}
            >
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          {role !== member.role && (
            <button type="button" onClick={saveRole} disabled={busy} className={portalButtonSecondary}>
              {busy ? 'Saving' : 'Change role'}
            </button>
          )}
          {!member.isSelf && (
            <button type="button" onClick={() => { setConfirming('remove'); setError(''); }}
              disabled={busy || lastOwner} className={portalButtonDanger}>
              <UserMinus size={15} aria-hidden /> Remove
            </button>
          )}
        </div>
      )}

      {canManage && lastOwner && (
        <p className="mt-2 flex items-start gap-1.5 text-sm leading-normal text-lake-700">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {member.isSelf ? 'You are' : 'This is'} the only owner. A team always needs one, so make another member an
            owner before changing this role{member.isSelf ? '' : ' or removing them'}.
          </span>
        </p>
      )}

      <AnimatePresence initial={false}>
        {confirming === 'remove' && (
          <Unfold>
            <div role="alertdialog" aria-label={`Remove ${member.name}`}
              className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3.5">
              <p className="text-[15px] leading-normal text-red-800">
                Remove {member.name} from {company.name}? They lose access straight away. Boats they hold pass to
                another owner; the hours, services and captains they recorded stay with the team.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button ref={confirmRef} type="button" onClick={remove} disabled={busy}
                  className={`${portalButtonDanger} border-red-300`}>
                  {busy ? 'Removing' : 'Remove from team'}
                </button>
                <button type="button" onClick={() => setConfirming(null)} disabled={busy} className={portalButtonSecondary}>
                  Keep them
                </button>
              </div>
            </div>
          </Unfold>
        )}
      </AnimatePresence>

      {error && <p role="alert" className="mt-2 text-[15px] font-medium text-red-700">{error}</p>}
    </li>
  );
}

function AddMemberForm({ company, onAdded }: { company: Company; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyMemberRole>('staff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');
  const emailId = useId();
  const roleId = useId();
  const hintId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim()) { setError('Enter their email address.'); return; }
    setBusy(true); setError(''); setAdded('');
    try {
      await team.addMember(company.id, email, role);
      setAdded(`${email.trim()} is now on the team as ${ROLE_LABELS[role].toLowerCase()}.`);
      setEmail('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this person.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${portalCard} p-4 sm:p-5`} aria-labelledby={`${emailId}-title`}>
      <h3 id={`${emailId}-title`} className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-lake-950">
        <UserPlus size={18} aria-hidden /> Add a team member
      </h3>
      <p id={hintId} className="mt-1.5 text-[15px] leading-normal text-lake-700">
        They need their own operator account first: ask them to sign up as a boat operator, choosing
        &ldquo;On my own&rdquo;, with the email you enter here. Then add them.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="min-w-0">
          <label htmlFor={emailId} className="block text-sm font-medium text-lake-700">Their email</label>
          <input id={emailId} type="email" inputMode="email" autoComplete="off" value={email}
            onChange={(e) => setEmail(e.target.value)} aria-describedby={hintId}
            placeholder="name@example.com" className={inputClass} />
        </div>
        <div className="min-w-0">
          <label htmlFor={roleId} className="block text-sm font-medium text-lake-700">Role</label>
          <select id={roleId} value={role} onChange={(e) => setRole(e.target.value as CompanyMemberRole)} className={inputClass}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-2 text-sm leading-normal text-lake-700">{ROLE_LABELS[role]}: {ROLE_SUMMARIES[role]}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={portalButtonPrimary}>
          <UserPlus size={16} aria-hidden /> {busy ? 'Adding' : 'Add to team'}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {added && <p className="mt-3 rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] leading-normal text-lake-800">{added}</p>}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>
      )}
    </form>
  );
}

function LeaveTeam({ company, me, owners, onLeft }: {
  company: Company; me: TeamMember; owners: number; onLeft: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const lastOwner = me.role === 'owner' && owners <= 1;

  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  const leave = async () => {
    setBusy(true); setError('');
    try { await team.leaveTeam(company.id); onLeft(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not leave the team.'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`${portalCard} p-4 sm:p-5`}>
      <h3 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-lake-950">
        <LogOut size={18} aria-hidden /> Leave {company.name}
      </h3>
      <p className="mt-1.5 text-[15px] leading-normal text-lake-700">
        You lose access to this team&rsquo;s boats, bookings and documents straight away, and get an empty workspace of
        your own. What you recorded here stays with the team.
      </p>
      {lastOwner ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[15px] leading-normal text-amber-900">
          You are the only owner. Make another member an owner before you leave.
        </p>
      ) : (
        <button type="button" onClick={() => { setConfirming(true); setError(''); }} disabled={busy || confirming}
          className={`${portalButtonDanger} mt-3`}>
          <LogOut size={15} aria-hidden /> Leave team
        </button>
      )}
      <AnimatePresence initial={false}>
        {confirming && (
          <Unfold>
            <div role="alertdialog" aria-label="Leave the team"
              className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3.5">
              <p className="text-[15px] leading-normal text-red-800">
                Leave {company.name}? Only an owner of the team can add you back.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button ref={confirmRef} type="button" onClick={leave} disabled={busy}
                  className={`${portalButtonDanger} border-red-300`}>
                  {busy ? 'Leaving' : 'Leave team'}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={portalButtonSecondary}>
                  Stay
                </button>
              </div>
            </div>
          </Unfold>
        )}
      </AnimatePresence>
      {error && <p role="alert" className="mt-2 text-[15px] font-medium text-red-700">{error}</p>}
    </div>
  );
}

/**
 * The Team section of the company page: who is on the team and with which role,
 * add by e-mail, change role, remove, and leave. Every action is checked again on
 * the server (migration 40), including the rule that a team always keeps an owner;
 * the messages here only say it first.
 */
export default function TeamSection({
  company, role, members, loading, onChanged, onLeft,
}: {
  company: Company;
  role: CompanyMemberRole | null;
  members: TeamMember[];
  loading: boolean;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const canManage = roleCan(role, 'manage_members');
  const owners = team.ownerCount(members);
  const me = members.find((m) => m.isSelf) ?? null;
  const individual = company.operatorType === 'individual';

  return (
    <PortalSection
      title="Team"
      description={individual
        ? 'An individual operator works alone.'
        : 'Everyone who works in this workspace, and what each of them can do.'}
      className="mt-10"
    >
      {individual ? (
        <div className={`${portalCard} flex items-start gap-3 p-4 sm:p-5`}>
          <Users size={20} className="mt-0.5 shrink-0 text-lake-600" aria-hidden />
          <p className="min-w-0 text-[15px] leading-normal text-lake-700">
            You operate on your own, so there is no team to manage.
            {roleCan(role, 'edit_company')
              ? ' To bring in managers or crew, switch to a company account above.'
              : ''}
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
          <div className="min-w-0 space-y-4">
            {loading && members.length === 0 ? (
              <p className="text-base text-lake-700">Loading the team</p>
            ) : members.length === 0 ? (
              <p className="rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] text-lake-700">
                The team list could not be loaded. Reload the page to try again.
              </p>
            ) : (
              <ul className="space-y-2" aria-label="Team members">
                {members.map((m) => (
                  <MemberRow key={m.profileId} member={m} company={company}
                    canManage={canManage} owners={owners} onChanged={onChanged} />
                ))}
              </ul>
            )}
            {me && members.length > 1 && (
              <LeaveTeam company={company} me={me} owners={owners} onLeft={onLeft} />
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {canManage && <AddMemberForm company={company} onAdded={onChanged} />}
            <div className={`${portalCard} p-4 sm:p-5`}>
              <h3 className="text-base font-bold text-lake-950">What each role can do</h3>
              <dl className="mt-2 space-y-2">
                {ROLES.map((r) => (
                  <div key={r}>
                    <dt className="text-sm font-semibold text-lake-900">{ROLE_LABELS[r]}</dt>
                    <dd className="text-[15px] leading-normal text-lake-700">{ROLE_SUMMARIES[r]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </PortalSection>
  );
}
