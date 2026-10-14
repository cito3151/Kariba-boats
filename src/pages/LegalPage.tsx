import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, FileText, ShieldCheck } from 'lucide-react';
import PortalPage from '../components/portal/PortalPage';
import { portalCard } from '../components/portal/styles';
import { LoadingState } from '../components/StateViews';
import LegalMarkdown from '../components/legal/LegalMarkdown';
import { parseLegalMarkdown, type LegalHeading } from '../components/legal/parseLegalMarkdown';
import { bundledLegalDocuments, type BundledLegalDocType } from '../content/legal';
import { getCurrentDocument } from '../services/legal.service';
import { portalPhotos } from '../data/photos';

// The public /terms and /privacy pages. They show the version currently in force
// (the current row of legal_documents for the doc_type), and the draft bundled
// with the site (src/content/legal) only when no version has been published or
// the database cannot be reached. Either way the reader sees which version it is
// and since when it applies.

interface Shown {
  title: string;
  version: number;
  body: string;
  /** ISO date the version took effect; null for the unpublished bundled draft. */
  effectiveAt: string | null;
  source: 'published' | 'bundled' | 'offline';
}

const OTHER: Record<BundledLegalDocType, { to: string; label: string }> = {
  terms: { to: '/privacy', label: 'Privacy Policy' },
  privacy: { to: '/terms', label: 'Terms and Conditions' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function LegalPage({ docType }: { docType: BundledLegalDocType }) {
  const reduce = useReducedMotion();
  const location = useLocation();
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let live = true;
    const bundled = bundledLegalDocuments[docType];
    getCurrentDocument(docType)
      .then((doc) => {
        if (!live) return;
        setShown(doc
          ? { title: doc.title, version: doc.version, body: doc.body, effectiveAt: doc.effectiveAt, source: 'published' }
          : { title: bundled.title, version: bundled.version, body: bundled.body, effectiveAt: null, source: 'bundled' });
      })
      .catch(() => {
        if (live) setShown({ title: bundled.title, version: bundled.version, body: bundled.body, effectiveAt: null, source: 'offline' });
      });
    return () => { live = false; };
  }, [docType]);

  const parsed = useMemo(() => (shown ? parseLegalMarkdown(shown.body) : null), [shown]);

  // Scroll to a section and give it focus, so a keyboard or screen reader user
  // lands where a sighted reader's eye does. The hash is updated in place,
  // keeping the router's history state, so the address can be copied and shared.
  const goTo = useCallback((id: string, smooth = true) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'instant', block: 'start' });
    el.focus({ preventScroll: true });
    if (window.location.hash !== `#${id}`) {
      window.history.replaceState(window.history.state, '', `#${id}`);
    }
  }, [reduce]);

  // Arriving with a hash (/privacy#deleting-your-account): jump there once the
  // document has rendered.
  useEffect(() => {
    if (!parsed || !location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const frame = requestAnimationFrame(() => goTo(id, false));
    return () => cancelAnimationFrame(frame);
  }, [parsed, location.hash, goTo]);

  const headings = useMemo(() => parsed?.headings ?? [], [parsed]);
  const active = useActiveHeading(headings);
  const hasToc = headings.length > 1;
  const other = OTHER[docType];

  const subtitle = shown && (
    <>
      Version {shown.version}
      {' · '}
      {shown.effectiveAt
        ? <>In effect since {formatDate(shown.effectiveAt)}</>
        : <>Draft, not yet in effect</>}
    </>
  );

  return (
    <PortalPage
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: shown?.title ?? bundledLegalDocuments[docType].title }]}
      eyebrow="Legal"
      icon={docType === 'privacy' ? ShieldCheck : FileText}
      title={shown?.title ?? bundledLegalDocuments[docType].title}
      subtitle={subtitle || undefined}
      photo={docType === 'privacy' ? portalPhotos.partner : portalPhotos.trips}
    >
      {!shown || !parsed ? (
        <LoadingState large label="Loading document" />
      ) : (
        <div className={hasToc ? 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10' : undefined}>
          {hasToc && (
            <>
              <aside className="hidden lg:block">
                <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100svh-7rem)] overflow-y-auto pb-6 [scrollbar-width:thin]">
                  <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-lake-800">On this page</p>
                  <TocList headings={headings} active={active} onGo={goTo} />
                </nav>
              </aside>
              <MobileToc headings={headings} active={active} onGo={goTo} reduce={!!reduce} />
            </>
          )}

          <div className="min-w-0">
            {shown.source !== 'published' && (
              <p role="status" className="mb-4 rounded-lg border border-lake-200 bg-white px-4 py-3 text-[15px] leading-normal text-lake-800">
                {shown.source === 'offline'
                  ? 'We could not reach the server, so this is the copy built into the website. The version in force may differ.'
                  : 'No version of this document has been published yet. This is the current draft.'}
              </p>
            )}
            <article className={`${portalCard} px-5 py-7 sm:px-9 sm:py-10`}>
              <div className="max-w-[68ch]">
                <LegalMarkdown blocks={parsed.blocks} onHeadingLink={goTo} />
              </div>
            </article>
            <p className="mt-6 text-[15px] text-lake-800">
              See also our{' '}
              <Link to={other.to} className="rounded-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
                {other.label}
              </Link>.
            </p>
          </div>
        </div>
      )}
    </PortalPage>
  );
}

/** The section heading nearest the top of the screen, for the table of contents. */
function useActiveHeading(headings: LegalHeading[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (headings.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = headings.find((h) => visible.get(h.id));
        if (first) setActive(first.id);
      },
      // A band from just under the sticky header to 40% down the screen.
      { rootMargin: '-96px 0px -60% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);
  return active;
}

function TocList({ headings, active, onGo }: {
  headings: LegalHeading[]; active: string | null; onGo: (id: string) => void;
}) {
  return (
    <ol className="mt-3 space-y-0.5 border-l-2 border-lake-200">
      {headings.map((h) => {
        const current = h.id === active;
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => { e.preventDefault(); onGo(h.id); }}
              aria-current={current ? 'location' : undefined}
              className={`-ml-0.5 block border-l-2 py-1.5 pl-3.5 pr-2 text-[15px] leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lake-500 ${
                current
                  ? 'border-sunset-500 font-semibold text-lake-950'
                  : 'border-transparent text-lake-800 hover:border-lake-400 hover:text-lake-950'
              }`}
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** Below 1024px the contents fold into a disclosure above the document. */
function MobileToc({ headings, active, onGo, reduce }: {
  headings: LegalHeading[]; active: string | null; onGo: (id: string) => void; reduce: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <nav aria-label="On this page" className={`${portalCard} mb-4 lg:hidden`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-base font-bold text-lake-950 outline-none focus-visible:ring-2 focus-visible:ring-lake-500"
      >
        On this page
        <ChevronDown size={18} aria-hidden className={`shrink-0 text-lake-700 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId}>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4">
                {/* The panel stays open on a jump: folding it would shift the page up
                    under the section just scrolled to. */}
                <TocList headings={headings} active={active} onGo={onGo} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
