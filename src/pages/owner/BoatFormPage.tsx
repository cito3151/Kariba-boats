import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import PageTransition from '../../components/PageTransition';
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

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <Link to="/owner" className="inline-flex items-center gap-1.5 text-sm text-lake-600 hover:text-lake-900">
          <ArrowLeft size={15} /> Back to your boats
        </Link>

        <h1 className="mt-3 font-display text-2xl font-medium text-lake-950">
          {editing ? 'Edit boat' : 'Register a boat'}
        </h1>
        <p className="mt-1 text-sm text-lake-500">
          {editing
            ? 'Update the details, add photos, and submit for review when ready.'
            : 'Start with the details. You will add photos on the next step.'}
        </p>

        <div className="mt-4"><VerificationBanner /></div>

        <div className="mt-2 rounded-2xl border border-lake-100 bg-white p-5 sm:p-6">
          {editing && loading && <LoadingState label="Loading boat" />}
          {editing && error && <ErrorState message={error} onRetry={reload} />}
          {editing && !loading && !boat && (
            <ErrorState message="This boat could not be found." />
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
          <>
            {boat.status === 'rejected' && boat.rejectionReason && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">This boat was not approved</p>
                  <p>{boat.rejectionReason}</p>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-lake-100 bg-white p-5 sm:p-6">
              {imagesLoaded ? (
                <ImageUploader boatId={boat.id} ownerId={currentUser.id}
                  value={images} onChange={setImages} />
              ) : (
                <LoadingState label="Loading photos" />
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-lake-100 bg-white p-5 sm:p-6">
              {boat.status === 'pending' && (
                <p className="flex items-center gap-2 text-sm text-amber-700">
                  <CheckCircle2 size={16} /> Submitted. An administrator is reviewing this boat.
                </p>
              )}
              {boat.status === 'approved' && (
                <p className="flex items-center gap-2 text-sm text-lake-700">
                  <CheckCircle2 size={16} /> This boat is approved and live for tourists.
                </p>
              )}
              {canSubmit && (
                <div>
                  <p className="text-sm text-lake-600">
                    When the details and at least one photo are ready, submit this boat for review.
                  </p>
                  {submitError && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{submitError}</p>
                  )}
                  <button onClick={submitForReview} disabled={submitting || images.length === 0}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-lake-700 px-4 py-2 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
                    <Send size={14} /> {submitting ? 'Submitting' : 'Submit for review'}
                  </button>
                  {images.length === 0 && (
                    <p className="mt-2 text-xs text-lake-500">Add at least one photo to enable this.</p>
                  )}
                </div>
              )}
              {(boat.status === 'draft' || boat.status === 'rejected') && !accountVerified && (
                <p className="text-sm text-lake-600">
                  You can add photos and edit details now. Submitting for review unlocks once an
                  administrator verifies your owner account.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
