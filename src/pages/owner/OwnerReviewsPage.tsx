import { useId, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { Star } from 'lucide-react';
import OwnerPortalPage from '../../components/owner/OwnerPortalPage';
import RoleNotice from '../../components/owner/RoleNotice';
import PortalSection from '../../components/portal/PortalSection';
import Reveal from '../../components/Reveal';
import StarRating from '../../components/StarRating';
import StatTile from '../../components/StatTile';
import BookingRef from '../../components/BookingRef';
import ReviewCard from '../../components/reviews/ReviewCard';
import ReplyEditor from '../../components/reviews/ReplyEditor';
import { portalCard } from '../../components/portal/styles';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import { useOperatorAccess } from '../../data/operatorAccess';
import { loadedFigure, useAsync } from '../../hooks/useAsync';
import { useCompanyAsync } from '../../hooks/useCompanyAsync';
import * as reviewsSvc from '../../services/reviews.service';

type Show = 'all' | 'awaiting' | 'hidden';

const SELECT = 'min-h-11 w-full rounded-lg border border-lake-200 bg-white px-3 py-2 text-base text-lake-950 outline-none focus:border-lake-500 focus-visible:ring-2 focus-visible:ring-lake-500/30';

/**
 * The owner's Reviews tab: each boat's public rating, then every review of the
 * owner's boats with one public reply each. The reply is editable; the review
 * is not. Hidden reviews are listed too, marked, because the operator should
 * know a review was moderated even though the public no longer sees it.
 */
export default function OwnerReviewsPage() {
  const access = useOperatorAccess();
  const { data, loading, error, reload } = useCompanyAsync(reviewsSvc.listReviewsForOwner);
  // Replies need migration 32 (reply_to_review). Until then the list still shows.
  const { data: repliesLive } = useAsync(reviewsSvc.hasReviewsUpgrade, []);
  // The public reply speaks for the business: owners and managers (migration 40).
  const mayReply = access.can('reply_reviews');
  const canReply = repliesLive && mayReply;
  const reduce = useReducedMotion();
  const [boatFilter, setBoatFilter] = useState('all');
  const [show, setShow] = useState<Show>('all');
  const boatSelectId = useId();
  const showSelectId = useId();

  const boats = data?.boats ?? [];
  const reviews = data?.reviews ?? [];
  const awaiting = reviews.filter((r) => !r.hidden && !r.operatorResponse).length;
  const hiddenCount = reviews.filter((r) => r.hidden).length;
  const rows = reviews.filter((r) =>
    (boatFilter === 'all' || r.boatId === boatFilter)
    && (show === 'all' || (show === 'awaiting' ? !r.hidden && !r.operatorResponse : r.hidden)));

  return (
    <OwnerPortalPage
      title="Reviews"
      crumb="Reviews"
      subtitle="What guests say about your boats, and your public replies."
    >
      {access.role === 'staff' && (
        <RoleNotice role={access.role}>
          You can read every review of your team&rsquo;s boats. An owner or manager writes the public replies.
        </RoleNotice>
      )}

      {loading && !data && <LoadingState large label="Loading reviews" />}
      {error && <ErrorState large message={error} onRetry={reload} />}

      {data && (
        <div className="space-y-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatTile index={0} label="Reviews" icon={Star} value={loadedFigure(data, loading, reviews.length)} />
            <StatTile index={1} label="Awaiting your reply" value={loadedFigure(data, loading, awaiting)} />
            <StatTile index={2} label="Hidden by moderators" value={loadedFigure(data, loading, hiddenCount)} />
          </div>

          <PortalSection title="Rating by boat"
            description="The figures guests see on each boat's card and page. Hidden reviews do not count.">
            {boats.length === 0 ? (
              <EmptyState large title="No boats yet" hint="Once you list a boat and guests complete trips on it, their reviews appear here." />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {boats.map((b) => {
                  const s = reviewsSvc.summarize(reviews.filter((r) => r.boatId === b.id));
                  return (
                    <Reveal as="li" key={b.id} className={`${portalCard} p-4 sm:p-5`}>
                      <h3 className="break-words text-lg font-bold leading-snug text-lake-950">{b.name}</h3>
                      {s.average != null ? (
                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-[2rem] font-bold leading-none tabular-nums text-lake-950">{reviewsSvc.formatAverage(s.average)}</span>
                          <div>
                            <StarRating rating={s.average} size={16} showNumber={false} />
                            <p className="text-sm text-lake-700">
                              <span className="tabular-nums">{s.count}</span> review{s.count === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-base text-lake-700">
                          <span className="mr-2 rounded-sm bg-lake-50 px-2 py-0.5 text-[13px] font-bold uppercase tracking-[0.06em] text-lake-800 ring-1 ring-lake-200">New</span>
                          No reviews yet
                        </p>
                      )}
                    </Reveal>
                  );
                })}
              </ul>
            )}
          </PortalSection>

          <PortalSection title="All reviews"
            description={repliesLive === false
              ? 'Replying to reviews switches on once the latest database update is applied.'
              : !mayReply
                ? 'Each review takes one public reply from your team. The guest’s review cannot be changed.'
                : 'Each review takes one public reply from you. You can edit your reply; the guest’s review cannot be changed.'}>
            {reviews.length > 0 && (
              <div className="mb-4 grid gap-3 sm:max-w-xl sm:grid-cols-2">
                {boats.length > 1 && (
                  <div>
                    <label htmlFor={boatSelectId} className="block text-sm font-semibold text-lake-800">Boat</label>
                    <select id={boatSelectId} value={boatFilter} onChange={(e) => setBoatFilter(e.target.value)} className={`${SELECT} mt-1.5`}>
                      <option value="all">All boats</option>
                      {boats.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor={showSelectId} className="block text-sm font-semibold text-lake-800">Show</label>
                  <select id={showSelectId} value={show} onChange={(e) => setShow(e.target.value as Show)} className={`${SELECT} mt-1.5`}>
                    <option value="all">All reviews</option>
                    <option value="awaiting">Awaiting your reply</option>
                    <option value="hidden">Hidden by moderators</option>
                  </select>
                </div>
              </div>
            )}

            {reviews.length === 0 && (
              <EmptyState large title="No reviews yet"
                hint="Guests can review a trip once you mark it completed in Bookings. Their reviews will appear here." />
            )}
            {reviews.length > 0 && rows.length === 0 && (
              <EmptyState large title="Nothing to show" hint="No review matches these filters." />
            )}

            <ul className="space-y-3">
              <AnimatePresence>
                {rows.map((r) => (
                  <Reveal as="li" key={r.id} layout={!reduce}
                    exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                    className={`${portalCard} p-4 sm:p-5`}>
                    <ReviewCard review={r} showHidden
                      heading={
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-lake-100 pb-3">
                          <p className="min-w-0 break-words text-base font-bold text-lake-950">{r.boatName ?? 'Your boat'}</p>
                          <BookingRef reference={r.bookingReference ?? ''} />
                        </div>
                      }>
                      {canReply && <ReplyEditor review={r} onSaved={reload} />}
                    </ReviewCard>
                  </Reveal>
                ))}
              </AnimatePresence>
            </ul>
          </PortalSection>
        </div>
      )}
    </OwnerPortalPage>
  );
}
