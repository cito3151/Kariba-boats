import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface BoatImage {
  id: string; boatId: string; storagePath: string;
  sortOrder: number; isPrimary: boolean; moderationStatus: string;
}

const BUCKET = 'boat-images';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function publicImageUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function listBoatImages(boatId: string): Promise<BoatImage[]> {
  const { data, error } = await supabase
    .from('boat_images')
    .select('id, boat_id, storage_path, sort_order, is_primary, moderation_status')
    .eq('boat_id', boatId)
    .order('sort_order');
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r) => ({
    id: r.id, boatId: r.boat_id, storagePath: r.storage_path,
    sortOrder: r.sort_order, isPrimary: r.is_primary, moderationStatus: r.moderation_status,
  }));
}

// Batched fetch: one query for every visible boat's images, grouped by boat id.
// Avoids the N+1 of each card fetching its own images on a browse page.
export async function listImagesForBoats(boatIds: string[]): Promise<Record<string, BoatImage[]>> {
  if (boatIds.length === 0) return {};
  const { data, error } = await supabase
    .from('boat_images')
    .select('id, boat_id, storage_path, sort_order, is_primary, moderation_status')
    .in('boat_id', boatIds)
    .order('sort_order');
  if (error) throw new Error(humanizeError(error.message));
  const byBoat: Record<string, BoatImage[]> = {};
  for (const r of data ?? []) {
    const img: BoatImage = {
      id: r.id, boatId: r.boat_id, storagePath: r.storage_path,
      sortOrder: r.sort_order, isPrimary: r.is_primary, moderationStatus: r.moderation_status,
    };
    (byBoat[r.boat_id] ??= []).push(img);
  }
  return byBoat;
}

export async function uploadBoatImages(
  boatId: string, ownerId: string, files: File[],
): Promise<BoatImage[]> {
  const existing = await listBoatImages(boatId);
  if (existing.length + files.length > 10) {
    throw new Error(`A boat may have at most 10 photos. You have ${existing.length}.`);
  }

  const uploaded: BoatImage[] = [];
  for (const [i, file] of files.entries()) {
    if (!ALLOWED.includes(file.type)) {
      throw new Error(`${file.name} is not a JPEG, PNG, or WebP image.`);
    }
    if (file.size > MAX_BYTES) {
      throw new Error(`${file.name} is larger than 5 MB.`);
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${ownerId}/${boatId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

    const { data, error } = await supabase.from('boat_images').insert({
      boat_id: boatId, storage_path: path,
      sort_order: existing.length + i,
      is_primary: existing.length === 0 && i === 0,
      uploaded_by: ownerId,
    }).select('id, boat_id, storage_path, sort_order, is_primary, moderation_status').single();

    if (error) {
      // Never orphan a storage object when the row insert fails.
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(humanizeError(error.message));
    }
    uploaded.push({
      id: data.id, boatId: data.boat_id, storagePath: data.storage_path,
      sortOrder: data.sort_order, isPrimary: data.is_primary,
      moderationStatus: data.moderation_status,
    });
  }
  return uploaded;
}

export async function deleteBoatImage(image: BoatImage): Promise<void> {
  const { error } = await supabase.from('boat_images').delete().eq('id', image.id);
  if (error) throw new Error(humanizeError(error.message));
  await supabase.storage.from(BUCKET).remove([image.storagePath]);
}

/**
 * Saves a new photo order: each id's sort_order becomes its index in
 * `orderedIds`. Owners can update only is_primary and sort_order (migration 38),
 * and boat_images_write_own limits the rows to boats they manage. At most ten
 * small updates, sent together; if one fails the caller reloads the real order.
 */
export async function reorderImages(boatId: string, orderedIds: string[]): Promise<void> {
  const results = await Promise.all(orderedIds.map((id, index) =>
    supabase.from('boat_images').update({ sort_order: index }).eq('id', id).eq('boat_id', boatId)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(humanizeError(failed.error.message));
}

export async function setPrimaryImage(boatId: string, imageId: string): Promise<void> {
  const { error: clearError } = await supabase.from('boat_images')
    .update({ is_primary: false }).eq('boat_id', boatId);
  if (clearError) throw new Error(humanizeError(clearError.message));
  const { error } = await supabase.from('boat_images').update({ is_primary: true }).eq('id', imageId);
  if (error) throw new Error(humanizeError(error.message));
}
