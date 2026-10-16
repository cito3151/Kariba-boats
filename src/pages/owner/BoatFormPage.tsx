import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import OwnerPortalPage from '../../components/owner/OwnerPortalPage';
import { portalCard, portalButtonSecondary } from '../../components/portal/styles';
import Reveal from '../../components/Reveal';
import { BOAT_STATUS_CHIP } from '../../components/owner/boatStatus';
import BoatForm from '../../components/owner/BoatForm';
import ImageUploader from '../../components/owner/ImageUploader';
import { LoadingState, ErrorState } from '../../components/StateViews';
import VerificationBanner from '../../components/VerificationBanner';
import { useAuth } from '../../data/AuthContext';
import { useOperatorAccess } from '../../data/operatorAccess';
import { useAsync } from '../../hooks/useAsync';
import * as boats from '../../services/boats.service';
import * as imagesSvc from '../../services/images.service';
import type { BoatInput, OwnerBoat } from '../../services/boats.service';
import type { BoatImage } from '../../services/images.service';

function toInput(b: OwnerBoat): BoatInput {
  return {
    name: b.name, boatType: b.boatType, capacity: b.capacity, description: b.description,
    location: b.location, pricePerHour: b.pricePerHour, pricePerDay: b.pricePerDay,
    depositPercent: b.depositPercent,
    facilities: b.facilities, safetyEquipment: b.safetyEquipment, crewIncluded: b.crewIncluded,
    fuelPolicy: b.fuelPolicy, cancellationPolicy: b.cancellationPolicy, registrationNumber: b.registrationNumber,
    maintenanceIntervalHours: b.maintenanceIntervalHours, accumulatedHours: b.accumulatedHours,
    lastMaintenanceHours: b.lastMaintenanceHours,
  };
}

// Every field the edit form can change, keyed by its boats column. Total hours and
// hours at last service are left out: after creation they move only through
// log_operating_hours and complete_maintenance.
function changeMap(input: BoatInput): Record<string, unknown> {
  return {
    name: input.name, boat_type: input.boatType, capacity: input.capacity,
    description: input.description, location: input.location,
    price_per_hour: input.pricePerHour, price_per_day: input.pricePerDay,
    deposit_percent: input.depositPercent,
    facilities: input.facilities, safety_equipment: input.safetyEquipment,
    crew_included: input.crewIncluded, fuel_policy: input.fuelPolicy,
    cancellation_policy: input.cancellationPolicy,
    registration_number: input.registrationNumber,
    maintenance_interval_hours: input.maintenanceIntervalHours,
  };
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', boat_type: 'Type', capacity: 'Capacity', description: 'Description',
  location: 'Location', price_per_hour: 'Price per hour', price_per_day: 'Price per day',
  deposit_percent: 'Deposit percent', facilities: 'Facilities', safety_equipment: 'Safety equipment',
  crew_included: 'Crew included', fuel_policy: 'Fuel policy', cancellation_policy: 'Cancellation policy', registration_number: 'Registration number',
  maintenance_interval_hours: 'Service interval',
};

const label = (k: string) => FIELD_LABELS[k] ?? k;
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Only the fields that differ from the boat as loaded, so unchanged fields are never resent. */
function toChanges(input: BoatInput, boat: OwnerBoat): Record<string, unknown> {
  const next = changeMap(input);
  const prev = changeMap(toInput(boat));
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => !sameValue(v, prev[k])));
}

interface SaveResult { applied: string[]; pending: string[]; notSaved: string[] }

/**
 * Sorts each sent field by what the server actually did with it, read from the
 * boat it returned rather than guessed: waiting in pending_changes for an admin,
 * kept at its old value (a blank price is "no change" to the server), or saved.
 */
function classify(sent: Record<string, unknown>, before: OwnerBoat, saved: OwnerBoat): SaveResult {
  const prev = changeMap(toInput(before));
  const after = changeMap(toInput(saved));
  const pending = saved.pendingChanges ?? {};
  const result: SaveResult = { applied: [], pending: [], notSaved: [] };
  for (const [k, v] of Object.entries(sent)) {
    if (k in pending && sameValue(pending[k], v)) result.pending.push(k);
    else if (sameValue(after[k], prev[k])) result.notSaved.push(k);
    else result.applied.push(k);
  }
  return result;
}

const PRICE_FIELDS = new Set(['price_per_hour', 'price_per_day']);

/** What the last save did, field by field, in plain words. */
function SaveSummary({ result, live }: { result: SaveResult; live: boolean }) {
  const { applied, pending, notSaved } = result;
  const list = (keys: string[]) => keys.map(label).join(', ');
  if (applied.length + pending.length + notSaved.length === 0) {
    return <p className="mt-4 text-base leading-normal text-lake-700">No changes to save.</p>;
  }
  return (
    <div className="mt-4 space-y-2">
      {applied.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] leading-normal text-lake-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {live ? 'Saved and live on your listing now: ' : 'Saved: '}{list(applied)}.
          </span>
        </p>
      )}
      {pending.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[15px] leading-normal text-amber-900">
          <Clock size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            Sent for admin review: {list(pending)}. Your listing keeps the current
            values until an administrator approves them.
          </span>
        </p>
      )}
      {notSaved.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            Not changed: {list(notSaved)}.
            {notSaved.every((k) => PRICE_FIELDS.has(k)) && ' A price can be changed but not removed once it is set.'}
          </span>
        </p>
      )}
    </div>
  );
}

export default function BoatFormPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const access = useOperatorAccess();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const { data: boat, loading, error, reload } = useAsync<OwnerBoat | null>(
    () => (id ? boats.getOwnerBoat(id) : Promise.resolve(null)),
    [id],
  );

  const [images, setImages] = useState<BoatImage[]>([]);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  useEffect(() => {
    if (!id) return;
    imagesSvc.listBoatImages(id).then((imgs) => { setImages(imgs); setImagesLoaded(true); });
  }, [id]);

  // submit_boat_for_review checks the account that holds the boat (the team's
  // accountable owner), not whoever presses the button. For a sole operator that is
  // the signed-in account, so no extra read is made.
  const holderId = boat?.ownerId ?? null;
  const holderIsMe = !!currentUser && holderId === currentUser.id;
  const { data: holderVerified } = useAsync(
    () => (holderId && !holderIsMe ? boats.isAccountVerified(holderId) : Promise.resolve(null)),
    [holderId, holderIsMe],
  );

  if (!currentUser) return null;

  const canEdit = access.can('edit_boats');
  const isAccountableOwner = access.accountableOwnerId === currentUser.id;

  const handleCreate = async (input: BoatInput) => {
    if (!access.company) throw new Error('Your workspace has not loaded yet. Try again in a moment.');
    const created = await boats.createBoat(currentUser.id, access.company.id, input);
    navigate(`/owner/boats/${created.id}/edit`, { replace: true });
  };

  const handleEdit = async (input: BoatInput) => {
    if (!id || !boat) return;
    setSaveResult(null);
    const changes = toChanges(input, boat);
    if (Object.keys(changes).length === 0) {
      setSaveResult({ applied: [], pending: [], notSaved: [] });
      return;
    }
    const saved = await boats.proposeChanges(id, changes);
    setSaveResult(classify(changes, boat, saved));
    reload();
  };

  const submitForReview = async () => {
    if (!id) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      await boats.submitForReview(id);
      navigate('/owner');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not submit for review.');
    } finally {
      setSubmitting(false);
    }
  };

  const accountVerified = holderIsMe || !holderId
    ? currentUser.verificationStatus === 'verified'
    : holderVerified === true;
  const canSubmit = boat && (boat.status === 'draft' || boat.status === 'rejected') && accountVerified;

  const title = editing ? 'Edit boat' : 'Register a boat';

  return (
    <OwnerPortalPage
      title={title}
      crumb={title}
      subtitle={editing
        ? 'Update the details, add photos, and submit for review when ready.'
        : 'Start with the details. You will add photos on the next step.'}
    >
      {isAccountableOwner && <VerificationBanner />}

      {!access.loading && !canEdit && (
        <div role="note" className={`${portalCard} mb-4 max-w-3xl p-5`}>
          <p className="text-base font-semibold text-lake-950">
            {editing ? 'Only a team owner or manager can edit boats' : 'Only a team owner or manager can register boats'}
          </p>
          <p className="mt-1 text-[15px] leading-normal text-lake-700">
            You can see the fleet and log operating hours. Ask an owner or manager to make this change.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/owner" className={portalButtonSecondary}>Back to the fleet</Link>
            <Link to="/owner/maintenance" className={portalButtonSecondary}>Log hours</Link>
          </div>
        </div>
      )}

      {canEdit && boat?.status === 'rejected' && boat.rejectionReason && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 border-l-4 border-l-red-600 bg-red-50 p-4 text-[15px] leading-normal text-red-700">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div className="min-w-0 break-words">
            <p className="text-base font-semibold">This boat was not approved</p>
            <p>{boat.rejectionReason}</p>
          </div>
        </div>
      )}

      {/* A reload after a save keeps the form on screen; only a first load or a
          failed one shows here. */}
      {canEdit && editing && (!boat || error) && (
        <div className={`${portalCard} mb-6 max-w-3xl p-5 sm:p-6`}>
          {loading && !boat && <LoadingState large label="Loading boat" />}
          {error && <ErrorState large message={error} onRetry={reload} />}
          {!loading && !error && !boat && <ErrorState large message="This boat could not be found." />}
        </div>
      )}

      {/* The form lays itself out: its sections on the left, and on a wide screen
          a panel on the right that follows the scroll with the checklist, the save
          action and (once the boat exists) its review status and submit step.
          On a phone the photos and then the review status follow the form, as
          before. */}
      {canEdit && (!editing || boat) && (
        <BoatForm
          key={boat?.id ?? 'new'}
          initial={boat ? toInput(boat) : undefined}
          submitLabel={editing ? 'Save changes' : 'Create boat'}
          onSubmit={editing ? handleEdit : handleCreate}
          guestHint={!boat || boat.status !== 'approved'}
          status={editing && boat && saveResult
            ? <SaveSummary result={saveResult} live={boat.status === 'approved' && boat.isActive} />
            : null}
          after={editing && boat ? (
            <Reveal className={`${portalCard} p-5 sm:p-7`}>
              {imagesLoaded ? (
                <ImageUploader boatId={boat.id} ownerId={currentUser.id}
                  value={images} onChange={setImages} />
              ) : (
                <LoadingState large label="Loading photos" />
              )}
            </Reveal>
          ) : (
            <p className="text-[15px] leading-normal text-lake-700">
              You will add photos on the next step, once the boat is created.
            </p>
          )}
          aside={editing && boat ? (
            <Reveal className={`${portalCard} min-w-0 p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-lake-700">Review status</h2>
                <span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${BOAT_STATUS_CHIP[boat.status].className}`}>
                  {BOAT_STATUS_CHIP[boat.status].label}
                </span>
              </div>
              <div className="mt-3 empty:hidden">
                {boat.status === 'pending' && (
                  <p className="flex items-start gap-2 text-base leading-normal text-amber-800">
                    <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> Submitted. An administrator is reviewing this boat.
                  </p>
                )}
                {boat.status === 'approved' && (
                  <div className="space-y-3">
                    <p className="flex items-start gap-2 text-base leading-normal text-lake-700">
                      <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> This boat is approved and live for tourists.
                    </p>
                    <p className="text-[15px] leading-normal text-lake-700">
                      Changes to {boats.REVIEWED_BOAT_FIELDS.map((k) => label(k).toLowerCase()).join(', ')} wait
                      for admin review. Everything else applies as soon as you save.
                    </p>
                    {boat.pendingChanges && Object.keys(boat.pendingChanges).length > 0 && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[15px] leading-normal text-amber-900">
                        Waiting for review: {Object.keys(boat.pendingChanges).map(label).join(', ')}.
                      </p>
                    )}
                  </div>
                )}
                {canSubmit && (
                  <div>
                    <p className="text-base leading-normal text-lake-700">
                      When the details and at least one photo are ready, submit this boat for review.
                    </p>
                    {submitError && (
                      <p className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{submitError}</p>
                    )}
                    <button type="button" onClick={submitForReview} disabled={submitting || images.length === 0}
                      className={`${portalButtonSecondary} mt-3 w-full`}>
                      <Send size={16} /> {submitting ? 'Submitting' : 'Submit for review'}
                    </button>
                    {images.length === 0 && (
                      <p className="mt-2 text-[15px] text-lake-700">Add at least one photo to enable this.</p>
                    )}
                  </div>
                )}
                {(boat.status === 'draft' || boat.status === 'rejected') && !accountVerified && (
                  <p className="text-base leading-normal text-lake-700">
                    You can add photos and edit details now. Submitting for review unlocks once an
                    administrator verifies {holderIsMe || !holderId ? 'your owner account' : 'the account of your team’s owner'}.
                  </p>
                )}
              </div>
            </Reveal>
          ) : null}
        />
      )}
    </OwnerPortalPage>
  );
}
