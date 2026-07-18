import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, CheckCircle2, MessageSquareText } from 'lucide-react';
import { useAppData } from '../data/AppDataContext';

export default function ReviewForm({ boatId }: { boatId: string }) {
  const { addReview } = useAppData();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addReview({ boatId, touristName: name, rating, comment, bookingId: 'demo-completed' });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
      >
        <CheckCircle2 size={16} /> Thanks. Your review has been posted.
      </motion.div>
    );
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-lake-200 px-3 py-1.5 text-xs font-semibold text-lake-700 hover:bg-lake-50"
        >
          <MessageSquareText size={14} /> Leave feedback after your trip
        </button>
      ) : (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          onSubmit={submit}
          className="rounded-xl border border-lake-100 bg-lake-50 p-4 space-y-3 overflow-hidden"
        >
          <div>
            <label className="text-xs font-medium text-lake-500">Your name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-lake-500">Rating</label>
            <div className="mt-1 flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => {
                const value = i + 1;
                const filled = value <= (hoverRating || rating);
                return (
                  <button
                    type="button"
                    key={value}
                    onMouseEnter={() => setHoverRating(value)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(value)}
                  >
                    <Star size={22} className={filled ? 'fill-sunset-500 text-sunset-500' : 'text-lake-200'} />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-lake-500">Comment</label>
            <textarea
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400"
              placeholder="How was your trip?"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-lake-700 px-4 py-2 text-xs font-semibold text-white hover:bg-lake-800"
            >
              Submit review
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-lake-200 px-4 py-2 text-xs font-semibold text-lake-600 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </motion.form>
      )}
    </div>
  );
}
