import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Upload, Trash2, Star, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import * as images from '../../services/images.service';
import type { BoatImage } from '../../services/images.service';

// Every control on a photo: 32px square, white on the photo's dark foot.
const tileButton =
  'grid h-8 w-8 place-items-center rounded-md text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40 disabled:hover:bg-transparent';

export default function ImageUploader({
  boatId, ownerId, value, onChange,
}: {
  boatId: string; ownerId: string; value: BoatImage[];
  onChange: (next: BoatImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const reduce = useReducedMotion();
  // Moves save in order, one after another, so a quick run of clicks always
  // leaves the server with the last order shown.
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  // After a move the photo's tile changes place in the DOM, so focus is put
  // back on the button that was pressed (or its partner, once the photo reaches
  // an end and that button is disabled).
  const pendingFocus = useRef<{ id: string; dir: 'earlier' | 'later' } | null>(null);
  const tiles = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;
    const tile = tiles.current.get(want.id);
    const preferred = tile?.querySelector<HTMLButtonElement>(`[data-move="${want.dir}"]`);
    const other = tile?.querySelector<HTMLButtonElement>(`[data-move="${want.dir === 'earlier' ? 'later' : 'earlier'}"]`);
    (preferred && !preferred.disabled ? preferred : other)?.focus();
  }, [value]);

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

  const reloadFromServer = async () => {
    try { onChange(await images.listBoatImages(boatId)); } catch { /* the error already shown stands */ }
  };

  const remove = async (img: BoatImage) => {
    setBusy(true); setError('');
    try {
      await images.deleteBoatImage(img);
      let rest = value.filter((v) => v.id !== img.id);
      // A listing always has a cover while it has photos: when the cover goes,
      // the first photo left in the order takes its place.
      if (img.isPrimary && rest.length > 0) {
        try {
          await images.setPrimaryImage(boatId, rest[0].id);
          rest = rest.map((v, i) => ({ ...v, isPrimary: i === 0 }));
          setAnnouncement('Photo deleted. The first photo is now the cover.');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'The photo was deleted, but a new cover could not be set. Choose one with the star.');
        }
      } else {
        setAnnouncement('Photo deleted.');
      }
      onChange(rest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally { setBusy(false); }
  };

  const makePrimary = async (img: BoatImage) => {
    setBusy(true); setError('');
    try {
      await images.setPrimaryImage(boatId, img.id);
      onChange(value.map((v) => ({ ...v, isPrimary: v.id === img.id })));
      setAnnouncement('Cover photo changed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the cover photo.');
    } finally { setBusy(false); }
  };

  const move = (index: number, dir: 'earlier' | 'later') => {
    const target = dir === 'earlier' ? index - 1 : index + 1;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    const renumbered = next.map((img, i) => ({ ...img, sortOrder: i }));
    const ids = renumbered.map((img) => img.id);
    pendingFocus.current = { id: value[index].id, dir };
    setError('');
    setAnnouncement(`Photo moved to position ${target + 1} of ${value.length}.`);
    onChange(renumbered);
    saveChain.current = saveChain.current
      .then(() => images.reorderImages(boatId, ids))
      .catch(async (e) => {
        setError(e instanceof Error ? e.message : 'Could not save the new order.');
        await reloadFromServer();
      });
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

      {value.length > 1 && (
        <p className="mt-1.5 text-[15px] leading-normal text-lake-700">
          Guests see the cover photo first, then the others in this order. Use the arrows to move a photo.
        </p>
      )}

      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>}
      <p role="status" className="sr-only">{announcement}</p>

      {value.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-lake-200 py-8 px-4 text-center text-base leading-normal text-lake-700">
          At least one photo is required before you can submit this boat for review.
        </p>
      ) : (
        <ol className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <AnimatePresence>
            {value.map((img, index) => {
              const position = `photo ${index + 1} of ${value.length}`;
              return (
                <motion.li key={img.id} layout={!reduce}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  className="group relative aspect-square overflow-hidden rounded-lg">
                  <div ref={(el) => { if (el) tiles.current.set(img.id, el); else tiles.current.delete(img.id); }}
                    className="h-full w-full">
                    <img src={images.publicImageUrl(img.storagePath)} alt=""
                      className="h-full w-full object-cover" />
                    {img.isPrimary && (
                      <span className="absolute top-1.5 left-1.5 rounded-full bg-sunset-700 px-2 py-0.5 text-[13px] font-semibold text-white">
                        Cover
                      </span>
                    )}
                    {/* Always shown: a hover-only bar is unreachable on a phone, where
                        most owners manage their listing. */}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4">
                      <div className="flex gap-1">
                        <button type="button" data-move="earlier" disabled={index === 0}
                          onClick={() => move(index, 'earlier')}
                          title="Move earlier" aria-label={`Move ${position} earlier`} className={tileButton}>
                          <ChevronLeft size={18} aria-hidden />
                        </button>
                        <button type="button" data-move="later" disabled={index === value.length - 1}
                          onClick={() => move(index, 'later')}
                          title="Move later" aria-label={`Move ${position} later`} className={tileButton}>
                          <ChevronRight size={18} aria-hidden />
                        </button>
                      </div>
                      <div className="flex gap-1">
                        {!img.isPrimary && (
                          <button type="button" onClick={() => makePrimary(img)} disabled={busy}
                            title="Make cover photo" aria-label={`Make ${position} the cover photo`} className={tileButton}>
                            <Star size={17} aria-hidden />
                          </button>
                        )}
                        <button type="button" onClick={() => remove(img)} disabled={busy}
                          title="Delete photo" aria-label={`Delete ${position}`} className={tileButton}>
                          <Trash2 size={17} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
