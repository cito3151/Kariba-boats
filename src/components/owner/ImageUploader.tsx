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
    await images.setPrimaryImage(boatId, img.id);
    onChange(value.map((v) => ({ ...v, isPrimary: v.id === img.id })));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-lake-500">Photos ({value.length} of 10)</label>
        <button type="button" disabled={busy || value.length >= 10}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-lake-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Add photos
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
        className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {value.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-lake-200 py-8 text-center text-sm text-lake-500">
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
                  <span className="absolute top-1 left-1 rounded-full bg-sunset-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Cover
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {!img.isPrimary && (
                    <button type="button" onClick={() => makePrimary(img)} title="Make cover photo"
                      className="rounded p-1 text-white hover:bg-white/20"><Star size={13} /></button>
                  )}
                  <button type="button" onClick={() => remove(img)} title="Delete photo"
                    className="rounded p-1 text-white hover:bg-white/20"><Trash2 size={13} /></button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
