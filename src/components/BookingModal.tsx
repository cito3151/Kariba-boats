import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle2, MessageCircle, Loader2, AlertCircle } from 'lucide-react';
import type { Boat, ExperienceType } from '../data/types';
import { useAppData } from '../data/AppDataContext';
import { experienceLabels } from '../data/mockData';
import { DAY_END, DAY_START, minutesToTime, toISODate } from '../data/availability';

const START_TIMES = Array.from({ length: DAY_END - DAY_START - 1 }, (_, i) =>
  minutesToTime((DAY_START + i) * 60),
);
const DURATIONS = [2, 3, 4, 6, 8];

interface Props {
  boat: Boat;
  hotelId?: string | null;
  initialName?: string;
  initialPhone?: string;
  onClose: () => void;
}

type Step = 'form' | 'submitting' | 'success';

export default function BookingModal({
  boat,
  hotelId = null,
  initialName = '',
  initialPhone = '',
  onClose,
}: Props) {
  const { createBooking, getOperator } = useAppData();
  const operator = getOperator(boat.operatorId);
  const [step, setStep] = useState<Step>('form');
  const [touristName, setTouristName] = useState(initialName);
  const [touristPhone, setTouristPhone] = useState(initialPhone);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('16:00');
  const [durationHours, setDurationHours] = useState(2);
  const [tripDays, setTripDays] = useState(1);
  const [groupSize, setGroupSize] = useState(2);
  const [experienceType, setExperienceType] = useState<ExperienceType>(boat.experiences[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<ReturnType<typeof createBooking> | null>(null);

  const isHourly = boat.priceUnit === 'hour';
  const isWeekend = boat.priceUnit === 'weekend';

  const priceTotal = isHourly
    ? boat.priceAmount * durationHours
    : isWeekend
      ? boat.priceAmount
      : boat.priceAmount * tripDays;
  const deposit = Math.round(priceTotal * 0.2);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStep('submitting');
    setTimeout(() => {
      try {
        const b = createBooking({
          boatId: boat.id,
          touristName,
          touristPhone,
          hotelId,
          date,
          days: isWeekend ? 3 : isHourly ? 1 : tripDays,
          startTime: isHourly ? startTime : undefined,
          durationHours: isHourly ? durationHours : undefined,
          groupSize,
          experienceType,
          notes,
        });
        setBooking(b);
        setStep('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That slot is no longer available.');
        setStep('form');
      }
    }, 900);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.98 }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
          className="w-full sm:max-w-md max-h-[90svh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lake-950">
                {hotelId ? 'Book on behalf of guest' : 'Request to book'}
              </h3>
              <p className="text-xs text-lake-500">{boat.name}</p>
            </div>
            <button onClick={onClose} className="rounded-full p-1 text-lake-400 hover:bg-lake-50 hover:text-lake-700">
              <X size={18} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {step === 'form' && (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={submit}
                className="mt-4 space-y-3"
              >
                <div>
                  <label className="text-xs font-medium text-lake-500">
                    {hotelId ? "Guest's full name" : 'Your full name'}
                  </label>
                  <input
                    required
                    value={touristName}
                    onChange={(e) => setTouristName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                    placeholder="e.g. Jane Moyo"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-lake-500">
                    {hotelId ? "Guest's phone / WhatsApp" : 'Your phone / WhatsApp'}
                  </label>
                  <input
                    required
                    value={touristPhone}
                    onChange={(e) => setTouristPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                    placeholder="+263 77 000 0000"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-lake-500">
                      {isWeekend ? 'Start date (3 day trip)' : 'Date'}
                    </label>
                    <input
                      required
                      type="date"
                      min={toISODate(new Date())}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-lake-500">Group size</label>
                    <input
                      required
                      type="number"
                      min={1}
                      max={boat.capacity}
                      value={groupSize}
                      onChange={(e) => setGroupSize(Number(e.target.value) || 1)}
                      className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                    />
                  </div>
                </div>

                {isHourly && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-lake-500">Start time</label>
                      <select
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                      >
                        {START_TIMES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-lake-500">Duration</label>
                      <select
                        value={durationHours}
                        onChange={(e) => setDurationHours(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                      >
                        {DURATIONS.map((d) => (
                          <option key={d} value={d}>
                            {d} hours
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {boat.priceUnit === 'day' && (
                  <div>
                    <label className="text-xs font-medium text-lake-500">Number of days</label>
                    <input
                      required
                      type="number"
                      min={1}
                      max={7}
                      value={tripDays}
                      onChange={(e) => setTripDays(Math.max(1, Number(e.target.value) || 1))}
                      className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-lake-500">Experience</label>
                  <select
                    value={experienceType}
                    onChange={(e) => setExperienceType(e.target.value as ExperienceType)}
                    className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                  >
                    {boat.experiences.map((exp) => (
                      <option key={exp} value={exp}>
                        {experienceLabels[exp]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-lake-500">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                    placeholder="Any special requests..."
                  />
                </div>

                {/* Price breakdown */}
                <div className="rounded-lg bg-lake-50 px-3 py-2.5 text-xs text-lake-600 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>
                      {isHourly
                        ? `$${boat.priceAmount}/hour x ${durationHours} hours`
                        : isWeekend
                          ? 'Weekend package (3 days)'
                          : `$${boat.priceAmount}/day x ${tripDays} day${tripDays > 1 ? 's' : ''}`}
                    </span>
                    <span className="font-semibold text-lake-900">${priceTotal}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-lake-100 pt-1.5">
                    <span>Deposit to confirm (20%)</span>
                    <span className="font-semibold text-lake-900">${deposit}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Balance paid on the day</span>
                    <span className="font-semibold text-lake-900">${priceTotal - deposit}</span>
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
                  >
                    <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 transition-colors"
                >
                  Send request to {operator?.businessName}
                </button>
                <p className="text-[11px] text-lake-400 text-center">
                  Operator usually responds within {operator?.responseTimeHours}h. No charge until confirmed.
                </p>
              </motion.form>
            )}

            {step === 'submitting' && (
              <motion.div
                key="submitting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-8 mb-6 flex flex-col items-center gap-3 text-lake-500"
              >
                <Loader2 size={28} className="animate-spin text-lake-500" />
                <p className="text-sm">Sending request to operator…</p>
              </motion.div>
            )}

            {step === 'success' && booking && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mt-4"
              >
                <div className="flex flex-col items-center text-center py-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
                  >
                    <CheckCircle2 size={44} className="text-emerald-500" />
                  </motion.div>
                  <h4 className="mt-3 font-semibold text-lake-950">Request sent</h4>
                  <p className="text-sm text-lake-500 mt-1">
                    Booking <span className="font-mono">{booking.id}</span> is awaiting operator
                    confirmation.
                  </p>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-4 rounded-xl border border-lake-100 bg-lake-50 p-3 flex items-start gap-2"
                >
                  <MessageCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-lake-700">
                    <p className="font-semibold">WhatsApp notification sent</p>
                    <p className="mt-0.5">
                      "New booking request: {groupSize} people, {date || 'date TBC'}
                      {isHourly ? ` at ${startTime} (${durationHours}h)` : ''} for {boat.name}.
                      Reply to confirm." Sent to {operator?.contactName}
                    </p>
                  </div>
                </motion.div>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-lake-500">Deposit due once confirmed</span>
                  <span className="font-semibold">${booking.depositAmount}</span>
                </div>

                <button
                  onClick={onClose}
                  className="mt-5 w-full rounded-lg bg-lake-700 py-2.5 text-sm font-semibold text-white hover:bg-lake-800 transition-colors"
                >
                  Done
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
