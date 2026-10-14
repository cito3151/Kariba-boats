import { useId, useState } from 'react';
import { MessageSquareReply, PenLine } from 'lucide-react';
import { portalButtonBase, portalButtonSecondary } from '../portal/styles';
import { REPLY_MAX_LENGTH, replyToReview, type Review } from '../../services/reviews.service';

// Filled navy, not the page's one orange action: a reply editor repeats on every
// review card. White on lake-700 is well over AA.
const saveButton = `${portalButtonBase} min-h-11 bg-lake-700 font-semibold text-white hover:bg-lake-800`;

/**
 * The operator's one public reply to a review: write it, or edit or remove the
 * one already there. The review itself is never editable here. The server
 * (reply_to_review, guard_review_write) only lets the boat's owner or a member of
 * its company change the reply.
 */
export default function ReplyEditor({ review, onSaved }: { review: Review; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.operatorResponse ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { text: useId(), help: useId(), count: useId() };
  const hasReply = Boolean(review.operatorResponse);
  const trimmed = text.trim();

  const open = () => { setText(review.operatorResponse ?? ''); setError(''); setEditing(true); };

  const save = async () => {
    setBusy(true); setError('');
    try {
      await replyToReview(review.id, trimmed);
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your reply.');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="mt-3">
        <button type="button" onClick={open} className={`${portalButtonSecondary} min-h-11`}>
          {hasReply ? <><PenLine size={16} aria-hidden /> Edit your reply</> : <><MessageSquareReply size={16} aria-hidden /> Reply publicly</>}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-lake-100 bg-lake-50 p-4">
      <label htmlFor={ids.text} className="block text-base font-bold text-lake-950">
        {hasReply ? 'Edit your public reply' : 'Your public reply'}
      </label>
      <p id={ids.help} className="mt-1 text-sm leading-relaxed text-lake-700">
        It shows under this review on your boat&rsquo;s page. Thank the guest and answer the point they raised;
        keep personal details out. You can edit your reply later. The guest&rsquo;s review cannot be changed.
      </p>
      <textarea id={ids.text} value={text} onChange={(e) => setText(e.target.value)} rows={3}
        maxLength={REPLY_MAX_LENGTH} aria-describedby={`${ids.help} ${ids.count}`}
        className="mt-2 w-full rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base leading-relaxed text-lake-950 outline-none focus:border-lake-500 focus-visible:ring-2 focus-visible:ring-lake-500/30" />
      <p id={ids.count} className="mt-1 text-right text-sm tabular-nums text-lake-700">
        {text.length} / {REPLY_MAX_LENGTH}<span className="sr-only"> characters</span>
      </p>
      {error && <p role="alert" className="mt-1 text-[15px] font-medium text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy || (!trimmed && !hasReply) || trimmed === (review.operatorResponse ?? '')}
          className={saveButton}>
          {busy ? 'Saving' : !trimmed && hasReply ? 'Remove reply' : hasReply ? 'Save changes' : 'Post reply'}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={busy} className={`${portalButtonSecondary} min-h-11`}>
          Cancel
        </button>
      </div>
    </div>
  );
}
