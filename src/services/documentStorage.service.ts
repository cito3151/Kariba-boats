import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

/**
 * Shared bucket and row-deletion logic behind every verification document, company
 * or account-level. Both companies.service.ts (company proofs) and
 * documents.service.ts (account-level proofs) delegate here instead of keeping
 * their own copies of the same storage code.
 */
export const DOCUMENT_BUCKET = 'registration-docs';

/** Short-lived URL for viewing a private document. Owner or admin, per storage RLS. */
export async function signedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw new Error(humanizeError(error.message));
  return data.signedUrl;
}

/**
 * Opens a private document in a new tab.
 *
 * The tab has to be opened synchronously inside the click: awaiting the signed URL
 * first breaks the user-gesture chain, and Safari and Firefox then block the window
 * without telling anyone. `noopener` in the feature string is not usable either,
 * because it makes window.open return null, so the opener link is cut by hand.
 */
export async function openDocument(storagePath: string): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab) {
    throw new Error('Your browser blocked the document window. Allow pop-ups for this site, then try again.');
  }
  tab.opener = null;
  try {
    tab.location.replace(await signedUrl(storagePath));
  } catch (e) {
    tab.close();
    throw e;
  }
}

/**
 * Deletes one verification_documents row, then its storage object, and reports a
 * failure at either step instead of swallowing it.
 *
 * RLS can make `.delete()` return with no error but zero rows touched (the row is
 * already gone, or a policy silently refuses it) — a still-approved document is not
 * something we can prove was actually removed. Requesting an exact `count` catches
 * that before storage is touched. Storage deletion is checked separately, and after
 * a successful row delete: once the row is gone, `storagePath` is unrecoverable
 * from the UI, so a failed remove has to surface rather than be discarded, or the
 * file is orphaned in the bucket forever with no row left pointing at it.
 */
export async function deleteVerificationDocument(id: string, storagePath: string): Promise<void> {
  const { error, count } = await supabase
    .from('verification_documents')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw new Error(humanizeError(error.message));
  if (!count) {
    throw new Error('That document record could not be found. It may already have been removed.');
  }

  const { error: storageError } = await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
  if (storageError) {
    throw new Error(
      'The document record was deleted, but its file could not be removed from storage. Tell an administrator so the file can be cleaned up by hand.',
    );
  }
}
