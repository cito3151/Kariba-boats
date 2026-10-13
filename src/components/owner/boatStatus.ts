import type { BoatStatus } from '../../services/boats.service';

/** Label and chip colours for a boat's listing status, shared by the owner overview and the boat form. */
export const BOAT_STATUS_CHIP: Record<BoatStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  pending: { label: 'Awaiting review', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Live', className: 'bg-lake-100 text-lake-800' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-700' },
};
