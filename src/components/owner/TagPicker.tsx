import { useId, type KeyboardEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { mergeTags, sameTag as same, splitTags } from './tags';

// Shared chip shape: 40px tall for a thumb, 15px type, a ring rather than a
// border so the selected fill does not shift the label by a pixel.
const chip =
  'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold outline-none transition-[background-color,color,box-shadow,scale] duration-150 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 active:scale-[0.97] motion-reduce:active:scale-100';
const chipOn = 'bg-lake-800 text-white hover:bg-lake-900';
const chipOff = 'bg-white text-lake-800 ring-1 ring-inset ring-lake-200 hover:bg-lake-50 hover:text-lake-950';

/**
 * A list of short items (facilities, safety equipment) picked as toggle chips,
 * with a field for anything the suggestions do not cover. The value is the same
 * array of strings the boat stores: a suggestion is added with its own spelling,
 * a stored item that matches one (in any case) lights it up and is kept as
 * stored, and items of the owner's own appear as chips that can be removed.
 *
 * The text in the "Add your own" field is the parent's (`draft`), so a form can
 * still save what was typed but not yet added.
 */
export default function TagPicker({
  label, hint, suggestions, value, onChange, draft, onDraftChange, placeholder,
}: {
  label: string;
  hint?: string;
  suggestions: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  draft: string;
  onDraftChange: (text: string) => void;
  placeholder: string;
}) {
  const groupId = useId();
  const inputId = useId();
  const hintId = useId();

  const own = value.filter((v) => !suggestions.some((s) => same(s, v)));

  const toggle = (s: string) => {
    const has = value.some((v) => same(v, s));
    onChange(has ? value.filter((v) => !same(v, s)) : [...value, s]);
  };

  const addDraft = () => {
    const items = splitTags(draft);
    if (items.length === 0) return;
    // A typed item that matches a suggestion takes the suggestion's spelling.
    const named = items.map((i) => suggestions.find((s) => same(s, i)) ?? i);
    onChange(mergeTags(value, named));
    onDraftChange('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter adds the item rather than submitting the whole form.
    if (e.key === 'Enter') { e.preventDefault(); addDraft(); }
  };

  return (
    <div role="group" aria-labelledby={groupId} aria-describedby={hint ? hintId : undefined}>
      <p id={groupId} className="text-sm font-medium text-lake-700">{label}</p>
      {hint && <p id={hintId} className="mt-0.5 text-[13px] leading-normal text-lake-700">{hint}</p>}

      <ul className="mt-2.5 flex flex-wrap gap-2">
        {suggestions.map((s) => {
          const on = value.some((v) => same(v, s));
          return (
            <li key={s}>
              <button type="button" aria-pressed={on} onClick={() => toggle(s)}
                className={`${chip} ${on ? chipOn : chipOff}`}>
                {on ? <Check size={15} aria-hidden /> : <Plus size={15} aria-hidden className="text-lake-600" />}
                {s}
              </button>
            </li>
          );
        })}
        {own.map((v) => (
          <li key={v}>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))}
              aria-label={`Remove ${v}`} className={`${chip} ${chipOn} max-w-full`}>
              <span className="min-w-0 break-words text-left">{v}</span>
              <X size={15} aria-hidden className="shrink-0" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">Add your own to {label.toLowerCase()}</label>
          <input id={inputId} value={draft} onChange={(e) => onDraftChange(e.target.value)} onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="w-full min-w-0 rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500" />
        </div>
        <button type="button" onClick={addDraft} disabled={!draft.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-lake-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-lake-700 outline-none hover:bg-lake-50 hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 disabled:opacity-50">
          <Plus size={15} aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}
