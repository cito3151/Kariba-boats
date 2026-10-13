import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import PhotoBackdrop from '../PhotoBackdrop';
import { REVEAL_STAGGER, riseOnMount } from '../motion';
import { portalPhotos, type Photo } from '../../data/photos';

export interface Crumb {
  label: string;
  /** Omit on the last crumb: it is the current page and is not a link. */
  to?: string;
}

export interface PortalHeaderProps {
  /** Home first, current page last. Long labels (business names) wrap. */
  breadcrumbs?: Crumb[];
  /** Which portal this is, set small and uppercase above the title. */
  eyebrow: string;
  icon?: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  /** Buttons on the right of the title (below it on a phone). One primary at most. */
  actions?: ReactNode;
  /**
   * The boat photograph behind the band, one per portal (see `portalPhotos`), so
   * each portal is recognisable at a glance. Defaults to the admin photo.
   */
  photo?: Photo;
}

/**
 * The page-title band of a signed-in portal page: a full-bleed navy band under
 * the site header holding the breadcrumb, an uppercase eyebrow naming the portal,
 * the page h1, and optional subtitle and actions. Use it once, at the top of every
 * portal screen, normally through PortalPage rather than on its own. It replaced
 * the rounded photo banner the dashboards used, so every portal page opens the
 * same way regardless of role.
 *
 * Behind the type is a boat photograph under a navy scrim, the way MSC sets its
 * page headers. The scrim never drops below 75% navy anywhere text can sit
 * (92% at the left, 75% at the right edge): at 75% even a pure white pixel
 * behind it leaves lake-200 at 4.7:1 and white at 7:1, so the text passes AA
 * whatever the photo does. Measured on the actual photos at 375, 768 and
 * 1440px, the worst case for lake-200 is 5.1:1.
 *
 * The band is always at the top of the page, so its type rises on mount, in
 * reading order (breadcrumb, title block, actions), rather than waiting for a
 * scroll. The photo sits exactly on its chosen crop with the page at the top and
 * drifts gently down as the page scrolls away from it (PhotoBackdrop's `top`
 * parallax; the band's overflow-hidden keeps the layer inside it).
 */
export default function PortalHeader({
  breadcrumbs, eyebrow, icon: Icon, title, subtitle, actions, photo = portalPhotos.admin,
}: PortalHeaderProps) {
  const reduce = useReducedMotion();
  const rise = (step: number) => riseOnMount(reduce, 0.04 + step * REVEAL_STAGGER);

  return (
    <div className="relative overflow-hidden bg-lake-950 text-white">
      <PhotoBackdrop photo={photo} priority parallax="top" />
      <div aria-hidden className="absolute inset-0 bg-linear-to-r from-lake-950/92 via-lake-950/84 to-lake-950/75" />
      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <motion.nav aria-label="Breadcrumb" {...rise(0)}>
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
              {breadcrumbs.map((crumb, i) => (
                <Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 && (
                    <li aria-hidden="true" className="flex text-lake-300">
                      <ChevronRight size={14} />
                    </li>
                  )}
                  <li className="min-w-0 break-words">
                    {/* lake-200 is 10.6:1 on lake-950; the current page is white. */}
                    {crumb.to ? (
                      <Link
                        to={crumb.to}
                        className="inline-flex min-h-6 items-center rounded-sm text-lake-200 underline-offset-4 outline-none transition-colors hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-sunset-400 focus-visible:ring-offset-2 focus-visible:ring-offset-lake-950"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="inline-flex min-h-6 items-center font-medium text-white">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                </Fragment>
              ))}
            </ol>
          </motion.nav>
        )}

        <div className="mt-5 flex flex-col gap-5 sm:mt-6 sm:flex-row sm:items-end sm:justify-between">
          <motion.div className="min-w-0" {...rise(1)}>
            <p className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-lake-200">
              {Icon && <Icon size={15} className="shrink-0 text-sunset-300" aria-hidden />}
              {eyebrow}
            </p>
            <h1 className="mt-2 break-words font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] sm:text-[2rem]">
              {title}
            </h1>
            {subtitle && <p className="mt-2 max-w-2xl text-base leading-normal text-lake-100">{subtitle}</p>}
          </motion.div>
          {actions && <motion.div className="flex shrink-0 flex-wrap gap-2" {...rise(2)}>{actions}</motion.div>}
        </div>
      </div>
    </div>
  );
}
