import { useId, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Check } from 'lucide-react';
import type { BoatInput, BoatKind } from '../../services/boats.service';
import Reveal from '../Reveal';
import { revealSpring } from '../motion';
import { portalCard, portalButtonPrimaryLarge } from '../portal/styles';
import TagPicker from './TagPicker';
import { mergeTags, splitTags } from './tags';

const BOAT_TYPES: { value: BoatKind; label: string }[] = [
  { value: 'houseboat', label: 'Houseboat' },
  { value: 'speedboat', label: 'Speedboat' },
  { value: 'fishing', label: 'Fishing boat' },
  { value: 'cruiser', label: 'Cruiser' },
  { value: 'pontoon', label: 'Pontoon' },
];

const FUEL_POLICIES: { value: BoatInput['fuelPolicy']; label: string }[] = [
  { value: 'included', label: 'Fuel included' },
  { value: 'excluded', label: 'Fuel excluded' },
  { value: 'prepaid', label: 'Fuel prepaid' },
  { value: 'full_to_full', label: 'Full to full' },
];

const FACILITY_SUGGESTIONS = [
  'Shade canopy', 'Toilet', 'Shower', 'Cabins', 'Kitchen', 'Braai', 'Fridge', 'Cooler box',
  'Sun deck', 'Swim ladder', 'Fishing gear', 'Bluetooth audio',
] as const;

const SAFETY_SUGGESTIONS = [
  'Life jackets', 'Life ring', 'Fire extinguisher', 'First aid kit', 'Flares', 'Radio',
  'Navigation lights', 'Bilge pump',
] as const;

const EMPTY: BoatInput = {
  name: '', boatType: 'fishing', capacity: 4, description: '', location: '',
  pricePerHour: null, pricePerDay: null, depositPercent: 20, facilities: [], safetyEquipment: [],
  crewIncluded: true, fuelPolicy: 'included', registrationNumber: '',
  maintenanceIntervalHours: 100, accumulatedHours: 0, lastMaintenanceHours: 0,
};

const inputClass =
  'mt-1.5 w-full min-w-0 rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500 aria-[invalid=true]:border-red-400';
const labelClass = 'block text-sm font-medium text-lake-700';
const hintClass = 'mt-1.5 text-[13px] leading-normal text-lake-700';

function validate(v: BoatInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = v.name.trim();
  if (name.length < 2 || name.length > 80) errors.name = 'Name must be 2 to 80 characters.';
  if (!Number.isInteger(v.capacity) || v.capacity < 1 || v.capacity > 200)
    errors.capacity = 'Capacity must be a whole number from 1 to 200.';
  if (v.location.trim().length < 2) errors.location = 'Enter where the boat operates from.';
  const hasHour = v.pricePerHour != null && v.pricePerHour > 0;
  const hasDay = v.pricePerDay != null && v.pricePerDay > 0;
  if (!hasHour && !hasDay) errors.price = 'Set an hourly price, a daily price, or both.';
  if (v.depositPercent < 20 || v.depositPercent > 100)
    errors.depositPercent = 'Deposit must be between 20 and 100 percent.';
  if (!(v.maintenanceIntervalHours > 0))
    errors.maintenanceIntervalHours = 'Service interval must be greater than 0.';
  if (v.lastMaintenanceHours > v.accumulatedHours)
    errors.lastMaintenanceHours = 'Last service hours cannot exceed total hours.';
  return errors;
}

/** The form's sections, in order, with the validation keys each one owns. */
const SECTIONS = [
  { key: 'boat', title: 'The boat', hint: 'How guests recognise it, and how many people it carries.', fields: ['name', 'capacity'] },
  { key: 'where', title: 'Where and what', hint: 'Where trips leave from, and what makes them worth booking.', fields: ['location'] },
  { key: 'pricing', title: 'Pricing', hint: 'An hourly rate, a daily rate or both, in US dollars.', fields: ['price', 'depositPercent'] },
  { key: 'onboard', title: 'On board', hint: 'Tap what the boat carries, and add anything that is missing.', fields: [], optional: true },
  { key: 'maintenance', title: 'Maintenance', hint: 'Operating hours drive your service alerts. Guests never see them.', fields: ['maintenanceIntervalHours', 'lastMaintenanceHours'] },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];
type SectionState = 'done' | 'todo' | 'error' | 'optional';

/**
 * One titled card of the form, in the site's section grammar: a short orange
 * rule over an uppercase heading, a one-line hint, then its fields with room
 * between them. It rises in as it scrolls into view.
 */
function FormSection({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <Reveal className={`${portalCard} scroll-mt-28 p-5 sm:p-7`} id={id}>
      <section aria-labelledby={`${id}-title`}>
        <span aria-hidden className="block h-1 w-10 rounded-full bg-sunset-500" />
        <h2 id={`${id}-title`} tabIndex={-1}
          className="mt-3 text-lg font-extrabold uppercase tracking-[0.04em] text-lake-950 outline-none sm:text-xl">
          {title}
        </h2>
        <p className="mt-1 text-[15px] leading-normal text-lake-700">{hint}</p>
        <div className="mt-6 space-y-5">{children}</div>
      </section>
    </Reveal>
  );
}

/**
 * The boat details form: five titled sections in their own cards, with a panel
 * beside them on a wide screen that shows which sections are ready and holds
 * the save action, and the page's own status card (`aside`) under it. On a phone
 * the panel's checklist steps aside and the save action is a full-width button
 * at the foot of the form; `after` (the photos) follows it, then `aside`.
 *
 * `status` is the result of the last save, shown under whichever save button
 * is on screen. Each copy is a live region that is only displayed at its own
 * width, so a screen reader hears it once.
 */
export default function BoatForm({
  initial,
  onSubmit,
  submitLabel = 'Save',
  status,
  after,
  aside,
  guestHint = false,
}: {
  initial?: BoatInput;
  onSubmit: (input: BoatInput) => Promise<void> | void;
  submitLabel?: string;
  status?: ReactNode;
  after?: ReactNode;
  aside?: ReactNode;
  /** Say in the panel what guests will see (for a boat that is not live yet). */
  guestHint?: boolean;
}) {
  const [v, setV] = useState<BoatInput>(initial ?? EMPTY);
  // What is typed in each "Add your own" field but not yet added. Saved with the
  // rest, so nothing typed is lost to a missed Add.
  const [facilitiesDraft, setFacilitiesDraft] = useState('');
  const [safetyDraft, setSafetyDraft] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const uid = useId();
  const formId = `${uid}-form`;
  const fid = (k: string) => `${uid}-${k}`;
  const sectionId = (k: SectionKey) => `${uid}-section-${k}`;
  const reduce = useReducedMotion();

  const set = <K extends keyof BoatInput>(key: K, val: BoatInput[K]) =>
    setV((prev) => ({ ...prev, [key]: val }));

  const numberOrNull = (raw: string) => (raw === '' ? null : Number(raw));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const payload: BoatInput = {
      ...v,
      name: v.name.trim(),
      location: v.location.trim(),
      registrationNumber: v.registrationNumber.trim(),
      facilities: mergeTags(v.facilities, splitTags(facilitiesDraft)),
      safetyEquipment: mergeTags(v.safetyEquipment, splitTags(safetyDraft)),
    };
    const found = validate(payload);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Bring the first section that needs attention into view; the save button
      // may be in the side panel, a long way from it.
      const first = SECTIONS.find((s) => s.fields.some((f) => f in found));
      if (first) {
        document.getElementById(sectionId(first.key))?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
      return;
    }

    setBusy(true);
    try {
      await onSubmit(payload);
      setV(payload);
      setFacilitiesDraft('');
      setSafetyDraft('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save this boat.');
    } finally {
      setBusy(false);
    }
  };

  const err = (key: string) =>
    errors[key] ? <p id={`${fid(key)}-error`} className="mt-1.5 text-sm font-medium text-red-700">{errors[key]}</p> : null;
  const invalid = (key: string) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${fid(key)}-error` : undefined,
  });

  // The checklist reads the live values: a section is ready once its required
  // fields would pass, and shows an error only while a reported problem stands.
  const live = validate(v);
  const sectionState = (s: (typeof SECTIONS)[number]): SectionState => {
    if ('optional' in s && s.optional) {
      return v.facilities.length + v.safetyEquipment.length > 0 ? 'done' : 'optional';
    }
    const fields = s.fields as readonly string[];
    if (fields.every((f) => !(f in live))) return 'done';
    return fields.some((f) => f in errors && f in live) ? 'error' : 'todo';
  };
  const required = SECTIONS.filter((s) => !('optional' in s));
  const readyCount = required.filter((s) => sectionState(s) === 'done').length;
  const outstanding = Object.keys(errors).filter((k) => k in live).length;

  const goTo = (k: SectionKey) => {
    const el = document.getElementById(sectionId(k));
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };

  const submitButton = (
    <button type="submit" form={formId} disabled={busy} className={`${portalButtonPrimaryLarge} w-full`}>
      {busy ? 'Saving' : submitLabel}
    </button>
  );

  // What sits under a save button: why the last save failed, or what it did.
  const feedback = (where: 'phone' | 'desk') => {
    const shown = where === 'phone' ? 'lg:hidden' : 'hidden lg:block';
    return (
      <>
        {outstanding > 0 && (
          <p className={`${shown} mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700`}>
            <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
            {outstanding === 1 ? 'One field needs attention.' : `${outstanding} fields need attention.`}
          </p>
        )}
        {submitError && (
          <p role="alert" className={`${shown} mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700`}>{submitError}</p>
        )}
        <div role="status" aria-live="polite" className={shown}>{status}</div>
      </>
    );
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
      <div className="min-w-0 space-y-6">
        <form id={formId} onSubmit={handleSubmit} className="space-y-6">
          <FormSection id={sectionId('boat')} title={SECTIONS[0].title} hint={SECTIONS[0].hint}>
            <div>
              <label htmlFor={fid('name')} className={labelClass}>Boat name</label>
              <input id={fid('name')} value={v.name} onChange={(e) => set('name', e.target.value)}
                className={inputClass} placeholder="e.g. Tiger Fish Explorer" {...invalid('name')} />
              {err('name')}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor={fid('type')} className={labelClass}>Type</label>
                <select id={fid('type')} value={v.boatType} onChange={(e) => set('boatType', e.target.value as BoatKind)}
                  className={inputClass}>
                  {BOAT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor={fid('capacity')} className={labelClass}>Guest capacity</label>
                <input id={fid('capacity')} type="number" inputMode="numeric" min={1} max={200} value={v.capacity}
                  onChange={(e) => set('capacity', Number(e.target.value))} className={inputClass} {...invalid('capacity')} />
                {err('capacity')}
              </div>
            </div>
            <div className="sm:max-w-[calc(50%-0.625rem)]">
              <label htmlFor={fid('reg')} className={labelClass}>
                Registration number <span className="font-normal">(optional)</span>
              </label>
              <input id={fid('reg')} value={v.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)}
                className={inputClass} placeholder="As on the boat's licence" />
            </div>
          </FormSection>

          <FormSection id={sectionId('where')} title={SECTIONS[1].title} hint={SECTIONS[1].hint}>
            <div>
              <label htmlFor={fid('location')} className={labelClass}>Departure point</label>
              <input id={fid('location')} value={v.location} onChange={(e) => set('location', e.target.value)}
                className={inputClass} placeholder="e.g. Charara Harbour" {...invalid('location')} />
              {err('location')}
            </div>
            <div>
              <label htmlFor={fid('description')} className={labelClass}>
                Description <span className="font-normal">(optional)</span>
              </label>
              <textarea id={fid('description')} value={v.description} onChange={(e) => set('description', e.target.value)}
                rows={5} className={`${inputClass} resize-y leading-normal`} maxLength={2000}
                aria-describedby={`${fid('description')}-count`}
                placeholder="What makes this boat and the experience special?" />
              <p id={`${fid('description')}-count`} className={`${hintClass} text-right tabular-nums`}>
                {v.description.length} of 2000 characters
              </p>
            </div>
          </FormSection>

          <FormSection id={sectionId('pricing')} title={SECTIONS[2].title} hint={SECTIONS[2].hint}>
            <div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor={fid('hour')} className={labelClass}>Price per hour (USD)</label>
                  <input id={fid('hour')} type="number" inputMode="decimal" min={0} step="0.01" value={v.pricePerHour ?? ''}
                    onChange={(e) => set('pricePerHour', numberOrNull(e.target.value))}
                    className={inputClass} placeholder="Blank if not offered" {...invalid('price')} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={fid('day')} className={labelClass}>Price per day (USD)</label>
                  <input id={fid('day')} type="number" inputMode="decimal" min={0} step="0.01" value={v.pricePerDay ?? ''}
                    onChange={(e) => set('pricePerDay', numberOrNull(e.target.value))}
                    className={inputClass} placeholder="Blank if not offered" {...invalid('price')} />
                </div>
              </div>
              {err('price')}
            </div>
            <div className="sm:max-w-[calc(50%-0.625rem)]">
              <label htmlFor={fid('deposit')} className={labelClass}>Deposit to confirm a booking (%)</label>
              <input id={fid('deposit')} type="number" inputMode="numeric" min={20} max={100} step={1} value={v.depositPercent}
                onChange={(e) => set('depositPercent', Number(e.target.value))} className={inputClass}
                aria-invalid={errors.depositPercent ? true : undefined}
                aria-describedby={`${fid('deposit')}-hint${errors.depositPercent ? ` ${fid('depositPercent')}-error` : ''}`} />
              <p id={`${fid('deposit')}-hint`} className={hintClass}>Minimum 20 percent. Raise it if you want a larger deposit.</p>
              {err('depositPercent')}
            </div>
          </FormSection>

          <FormSection id={sectionId('onboard')} title={SECTIONS[3].title} hint={SECTIONS[3].hint}>
            <TagPicker
              label="Safety equipment"
              hint="Guests look for this first, so list everything on board."
              suggestions={SAFETY_SUGGESTIONS}
              value={v.safetyEquipment}
              onChange={(next) => set('safetyEquipment', next)}
              draft={safetyDraft}
              onDraftChange={setSafetyDraft}
              placeholder="Add your own"
            />
            <div className="border-t border-lake-100 pt-5">
              <TagPicker
                label="Facilities"
                suggestions={FACILITY_SUGGESTIONS}
                value={v.facilities}
                onChange={(next) => set('facilities', next)}
                draft={facilitiesDraft}
                onDraftChange={setFacilitiesDraft}
                placeholder="Add your own"
              />
            </div>
            <div className="grid gap-5 border-t border-lake-100 pt-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor={fid('fuel')} className={labelClass}>Fuel policy</label>
                <select id={fid('fuel')} value={v.fuelPolicy}
                  onChange={(e) => set('fuelPolicy', e.target.value as BoatInput['fuelPolicy'])}
                  className={inputClass}>
                  {FUEL_POLICIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 self-end rounded-lg border border-lake-200 bg-white px-3.5 py-2.5 text-base text-lake-800 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lake-500">
                <input type="checkbox" checked={v.crewIncluded}
                  onChange={(e) => set('crewIncluded', e.target.checked)} className="h-5 w-5 shrink-0 rounded accent-lake-700" />
                Crew or skipper is included
              </label>
            </div>
          </FormSection>

          <FormSection id={sectionId('maintenance')} title={SECTIONS[4].title} hint={SECTIONS[4].hint}>
            <div className="sm:max-w-[calc(50%-0.625rem)]">
              <label htmlFor={fid('interval')} className={labelClass}>Service interval (hours)</label>
              <input id={fid('interval')} type="number" inputMode="decimal" min={1} step="0.1" value={v.maintenanceIntervalHours}
                onChange={(e) => set('maintenanceIntervalHours', Number(e.target.value))}
                className={inputClass}
                aria-invalid={errors.maintenanceIntervalHours ? true : undefined}
                aria-describedby={`${fid('interval')}-hint${errors.maintenanceIntervalHours ? ` ${fid('maintenanceIntervalHours')}-error` : ''}`} />
              <p id={`${fid('interval')}-hint`} className={hintClass}>Operating hours the boat runs between services.</p>
              {err('maintenanceIntervalHours')}
            </div>
            <div>
              <p className="text-[15px] leading-normal text-lake-700">
                If the boat already has hours on it, enter them so alerts are accurate from day one.
              </p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor={fid('total')} className={labelClass}>Total hours so far</label>
                  <input id={fid('total')} type="number" inputMode="decimal" min={0} step="0.1" value={v.accumulatedHours}
                    onChange={(e) => set('accumulatedHours', Number(e.target.value))} className={inputClass} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={fid('last')} className={labelClass}>Hours at last service</label>
                  <input id={fid('last')} type="number" inputMode="decimal" min={0} step="0.1" value={v.lastMaintenanceHours}
                    onChange={(e) => set('lastMaintenanceHours', Number(e.target.value))} className={inputClass}
                    {...invalid('lastMaintenanceHours')} />
                  {err('lastMaintenanceHours')}
                </div>
              </div>
            </div>
          </FormSection>
        </form>

        {/* On a phone and tablet the save action closes the form. */}
        <div className="lg:hidden">
          {submitButton}
          {feedback('phone')}
        </div>

        {after}
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-24" aria-label="Listing summary">
        {/* The checklist and save action follow the scroll beside the form on a
            wide screen; on a narrower one the action is at the foot of the form. */}
        <Reveal className={`${portalCard} hidden p-5 lg:block`}>
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-lake-700">Your listing</h2>
          <p className="mt-2 text-base font-semibold text-lake-950">
            <span className="tabular-nums">{readyCount} of {required.length}</span> required sections ready
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-lake-100" aria-hidden>
            <motion.div
              className="h-full origin-left rounded-full bg-lake-700"
              initial={false}
              animate={{ scaleX: readyCount / required.length }}
              transition={reduce ? { duration: 0 } : revealSpring}
            />
          </div>
          <ol className="mt-4 space-y-1">
            {SECTIONS.map((s, i) => {
              const state = sectionState(s);
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => goTo(s.key)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500">
                    <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                      state === 'done' ? 'bg-lake-700 text-white'
                        : state === 'error' ? 'bg-red-600 text-white'
                        : 'bg-white text-lake-700 ring-1 ring-inset ring-lake-200'
                    }`}>
                      {state === 'done' ? <Check size={14} strokeWidth={3} /> : state === 'error' ? '!' : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-[15px] font-medium text-lake-950">{s.title}</span>
                    <span className={`shrink-0 text-[13px] ${state === 'error' ? 'font-semibold text-red-700' : 'text-lake-700'}`}>
                      {state === 'done' ? 'Ready' : state === 'error' ? 'Check' : state === 'optional' ? 'Optional' : 'To do'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {guestHint && (
            <p className="mt-4 border-t border-lake-100 pt-4 text-[15px] leading-normal text-lake-700">
              Guests see everything here except the maintenance hours, which stay with your team.
            </p>
          )}
          <div className="mt-4">
            {submitButton}
            {feedback('desk')}
          </div>
        </Reveal>
        {aside}
      </aside>
    </div>
  );
}
