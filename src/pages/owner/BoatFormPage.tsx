import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';
import OwnerPortalPage from '../../components/owner/OwnerPortalPage';
import { portalCard, portalButtonPrimary } from '../../components/portal/styles';
import { BOAT_STATUS_CHIP } from '../../components/owner/boatStatus';
import BoatForm from '../../components/owner/BoatForm';
import ImageUploader from '../../components/owner/ImageUploader';
import { LoadingState, ErrorState } from '../../components/StateViews';
import VerificationBanner from '../../components/VerificationBanner';
import { useAuth } from '../../data/AuthContext';
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
    fuelPolicy: b.fuelPolicy, registrationNumber: b.registrationNumber,
    maintenanceIntervalHours: b.maintenanceIntervalHours, accumulatedHours: b.accumulatedHours,
    lastMaintenanceHours: b.lastMaintenanceHours,
  };
}

function toChanges(input: BoatInput): Record<string, unknown> {
  return {
    name: input.name, boat_type: input.boatType, capacity: input.capacity,
    description: input.description, location: input.location,
    price_per_hour: input.pricePerHour, price_per_day: input.pricePerDay,
    deposit_percent: input.depositPercent,
    facilities: input.facilities, safety_equipment: input.safetyEquipment,
    crew_included: input.crewIncluded, fuel_policy: input.fuelPolicy,
    registration_number: input.registrationNumber,
    maintenance_interval_hours: input.maintenanceIntervalHours,
  };
}

export default function BoatFormPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
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

  useEffect(() => {
    if (!id) return;
    imagesSvc.listBoatImages(id).then((imgs) => { setImages(imgs); setImagesLoaded(true); });
  }, [id]);

  if (!currentUser) return null;

  const handleCreate = async (input: BoatInput) => {
    const created = await boats.createBoat(currentUser.id, input);
    navigate(`/owner/boats/${created.id}/edit`, { replace: true });
  };

  const handleEdit = async (input: BoatInput) => {
    if (!id) return;
    await boats.proposeChanges(id, toChanges(input));
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

  const accountVerified = currentUser.verificationStatus === 'verified';
  const canSubmit = boat && (boat.status === 'draft' || boat.status === 'rejected') && accountVerified;

  const title = editing ? 'Edit boat' : 'Register a boat';
  const showSide = editing && boat;

  return (
    <OwnerPortalPage
      title={title}
      crumb={title}
      subtitle={editing
        ? 'Update the details, add photos, and submit for review when ready.'
        : 'Start with the details. You will add photos on the next step.'}
    >
      <VerificationBanner />

      {boat?.status === 'rejected' && boat.rejectionReason && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 border-l-4 border-l-red-600 bg-red-50 p-4 text-[15px] leading-normal text-red-700">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div className="min-w-0 break-words">
            <p className="text-base font-semibold">This boat was not approved</p>
            <p>{boat.rejectionReason}</p>
          </div>
        </div>
      )}

      {/* Once a boat exists, its review status and the submit step sit in a side
          column beside the form on a wide screen, like the summary panel of a
          booking. Before that there is only the form, kept to a readable width. */}
      <div className={showSide ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]' : 'max-w-3xl'}>
        <div className="min-w-0 space-y-6">
          <div className={`${portalCard} p-5 sm:p-6`}>
            {editing && loading && <LoadingState large label="Loading boat" />}
            {editing && error && <ErrorState large message={error} onRetry={reload} />}
            {editing && !loading && !boat && (
              <ErrorState large message="This boat could not be found." />
            )}

            {(!editing || (editing && boat)) && (
              <BoatForm
                initial={boat ? toInput(boat) : undefined}
                submitLabel={editing ? 'Save changes' : 'Create boat'}
                onSubmit={editing ? handleEdit : handleCreate}
              />
            )}
          </div>

          {editing && boat && (
            <div className={`${portalCard} p-5 sm:p-6`}>
              {imagesLoaded ? (
                <ImageUploader boatId={boat.id} ownerId={currentUser.id}
                  value={images} onChange={setImages} />
              ) : (
                <LoadingState large label="Loading photos" />
              )}
            </div>
          )}
        </div>

        {editing && boat && (
          // After the form in the source, so on a phone it still comes after the
          // form and photos as before; on lg it moves up beside them and follows
          // the scroll, keeping the submit step in reach of a long form.
          <div className={`${portalCard} min-w-0 p-5 lg:sticky lg:top-24`}>
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
                <p className="flex items-start gap-2 text-base leading-normal text-lake-700">
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> This boat is approved and live for tourists.
                </p>
              )}
              {canSubmit && (
                <div>
                  <p className="text-base leading-normal text-lake-700">
                    When the details and at least one photo are ready, submit this boat for review.
                  </p>
                  {submitError && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{submitError}</p>
                  )}
                  <button onClick={submitForReview} disabled={submitting || images.length === 0}
                    className={`${portalButtonPrimary} mt-3 w-full`}>
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
                  administrator verifies your owner account.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </OwnerPortalPage>
  );
}
