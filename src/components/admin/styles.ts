import { portalButtonBase } from '../portal/styles';

// Filled decision buttons for the admin review cards. A review card repeats down
// the page, so its decisions cannot take the one orange portalButtonPrimary; these
// keep the portal button's shape and focus ring with the colours admins already
// read as approve, commit and reject. Everything else uses the portal strings.

/** Approve or verify: the green go-ahead. White on emerald-700 is 5.5:1. */
export const adminButtonApprove =
  `${portalButtonBase} bg-emerald-700 font-semibold text-white hover:bg-emerald-800`;

/** Save, publish or verify-and-link: commits a form in the card. */
export const adminButtonCommit =
  `${portalButtonBase} bg-lake-700 font-semibold text-white hover:bg-lake-800`;

/** The second, deliberate step of a rejection, after its reason is written. */
export const adminButtonConfirmReject =
  `${portalButtonBase} bg-red-600 font-semibold text-white hover:bg-red-700`;
