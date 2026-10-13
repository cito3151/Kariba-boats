import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';

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
}

/**
 * The page-title band of a signed-in portal page: a full-bleed navy band under
 * the site header holding the breadcrumb, an uppercase eyebrow naming the portal,
 * the page h1, and optional subtitle and actions. Use it once, at the top of every
 * portal screen, normally through PortalPage rather than on its own. It replaced
 * the rounded photo banner the dashboards used, so every portal page opens the
 * same way regardless of role.
 */
export default function PortalHeader({
  breadcrumbs, eyebrow, icon: Icon, title, subtitle, actions,
}: PortalHeaderProps) {
  return (
    <div className="bg-lake-950 text-white">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
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
          </nav>
        )}

        <div className="mt-5 flex flex-col gap-5 sm:mt-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-lake-200">
              {Icon && <Icon size={15} className="shrink-0 text-sunset-300" aria-hidden />}
              {eyebrow}
            </p>
            <h1 className="mt-2 break-words font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] sm:text-[2rem]">
              {title}
            </h1>
            {subtitle && <p className="mt-2 max-w-2xl text-base leading-normal text-lake-100">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
