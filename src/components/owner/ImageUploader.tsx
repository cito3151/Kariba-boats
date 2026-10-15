import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, Star, Loader2 } from 'lucide-react';
import * as images from '../../services/images.service';
import type { BoatImage } from '../../services/images.service';

export default function ImageUploader({
  boatId, ownerId, value, onChange,
}: {
  boatId: string; ownerId: string; value: BoatImage[];
  onChange: (next: BoatImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      const added = await images.uploadBoatImages(boatId, ownerId, Array.from(files));
      onChange([...value, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (img: BoatImage) => {
    setBusy(true);
    try {
      await images.deleteBoatImage(img);
      onChange(value.filter((v) => v.id !== img.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally { setBusy(false); }
  };

  const makePrimary = async (img: BoatImage) => {
    setBusy(true); setError('');
    try {
      await images.setPrimaryImage(boatId, img.id);
      onChange(value.map((v) => ({ ...v, isPrimary: v.id === img.id })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the cover photo.');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-lg font-bold tracking-[-0.01em] text-lake-900">Photos <span className="text-base font-medium tabular-nums text-lake-700">({value.length} of 10)</span></label>
        <button type="button" disabled={busy || value.length >= 10}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-lake-700 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Add photos
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
        className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>}

      {value.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-lake-200 py-8 px-4 text-center text-base leading-normal text-lake-700">
          At least one photo is required before you can submit this boat for review.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <AnimatePresence>
            {value.map((img) => (
              <motion.div key={img.id} layout
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative aspect-square overflow-hidden rounded-lg">
                <img src={images.publicImageUrl(img.storagePath)} alt=""
                  className="h-full w-full object-cover" />
                {img.isPrimary && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-sunset-700 px-2 py-0.5 text-xs font-semibold text-white">
                    Cover
                  </span>
                )}
                {/* Always shown: a hover-only bar is unreachable on a phone, where
                    most owners manage their listing. */}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4">
                  {!img.isPrimary && (
                    <button type="button" onClick={() => makePrimary(img)} title="Make cover photo" aria-label="Make cover photo"
                      className="grid h-8 w-8 place-items-center rounded-md text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"><Star size={17} /></button>
                  )}
                  <button type="button" onClick={() => remove(img)} title="Delete photo" aria-label="Delete photo"
                    className="grid h-8 w-8 place-items-center rounded-md text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"><Trash2 size={17} /></button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
