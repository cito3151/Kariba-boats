import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface VerificationDocument {
  id: string; userId: string; storagePath: string; fileName: string;
  label: string | null; uploadedAt: string;
}

const BUCKET = 'registration-docs';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_DOCS = 8;

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDoc(r: any): VerificationDocument {
  return {
    id: r.id, userId: r.user_id, storagePath: r.storage_path,
    fileName: r.file_name, label: r.label, uploadedAt: r.uploaded_at,
  };
}

const SELECT = 'id, user_id, storage_path, file_name, label, uploaded_at';

export async function listMyDocuments(userId: string): Promise<VerificationDocument[]> {
  const { data, error } = await supabase.from('verification_documents')
    .select(SELECT).eq('user_id', userId).order('uploaded_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(mapDoc);
}

// Admin view: RLS allows an admin to read any user's document rows.
export async function listUserDocuments(userId: string): Promise<VerificationDocument[]> {
  return listMyDocuments(userId);
}

export async function uploadDocuments(
  userId: string, items: { file: File; label: string }[],
): Promise<void> {
  const existing = await listMyDocuments(userId);
  if (existing.length + items.length > MAX_DOCS) {
    throw new Error(`You can upload at most ${MAX_DOCS} documents. You have ${existing.length}.`);
  }
  for (const { file, label } of items) {
    if (!ALLOWED.includes(file.type)) {
      throw new Error(`${file.name} must be a PDF, JPEG, or PNG.`);
    }
    if (file.size > MAX_BYTES) {
      throw new Error(`${file.name} is larger than 10 MB.`);
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

    const { error } = await supabase.from('verification_documents').insert({
      user_id: userId, storage_path: path, file_name: file.name, label: label.trim() || null,
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(humanizeError(error.message));
    }
  }
}

export async function deleteDocument(doc: VerificationDocument): Promise<void> {
  const { error } = await supabase.from('verification_documents').delete().eq('id', doc.id);
  if (error) throw new Error(humanizeError(error.message));
  await supabase.storage.from(BUCKET).remove([doc.storagePath]);
}

// Short-lived signed URL for viewing a private document (owner or admin, per storage RLS).
export async function signedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw new Error(humanizeError(error.message));
  return data.signedUrl;
}
