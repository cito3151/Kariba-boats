import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Anchor, Building2, ClipboardCheck, ShieldCheck, LogOut, Ticket, Briefcase, Menu, X,
} from 'lucide-react';
import { useAuth } from '../data/AuthContext';
import BrandMark from './BrandMark';

const allNavItems = [
  { to: '/', label: 'Browse Boats', icon: Anchor, end: true },
  { to: '/trips', label: 'My Trips', icon: Ticket },
  { to: '/hotel', label: 'Hotel Portal', icon: Building2 },
  { to: '/owner', label: 'Boat Owner Portal', icon: ClipboardCheck },
  { to: '/agency', label: 'Agency Portal', icon: Briefcase },
  { to: '/admin', label: 'Admin', icon: ShieldCheck },
];

// The brand block, role-filtered nav items and the auth controls cannot all
// share one row at phone widths -- the nav gets squeezed to a few unusable pixels.
// Below this width the nav and auth controls move into a disclosure panel under
// the header; at and above it the single-row desktop header is used.
const DESKTOP_QUERY = '(min-width: 1024px)'; // Tailwind `lg`
const MENU_ID = 'primary-mobile-menu';

// Footer links sit on lake-950: lake-200 is 10.6:1 there and white is 15.8:1.
const footerLinkClass =
  'rounded-sm text-left text-sm text-lake-200 outline-none transition-colors underline-offset-4 hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-sunset-400 focus-visible:ring-offset-2 focus-visible:ring-offset-lake-950';

export default function Layout({ children }: { children: ReactNode }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const navItems = allNavItems.filter((item) => {
    if (item.to === '/') return true;
    // Admin is oversight only: Browse Boats and the Admin panel, nothing else.
    if (currentUser?.role === 'admin') return item.to === '/admin';
    if (item.to === '/trips') return !!currentUser;
    // Checked before the logged-out passthrough below, which would otherwise
    // advertise the admin panel to the public. The route itself is guarded, but
    // the link should not be there at all, and dropping it also takes the
    // logged-out nav back under the width it has to fit in.
    if (item.to === '/admin') return false;
    if (!currentUser) return true;
    if (item.to === '/hotel') return currentUser.role === 'hotel';
    if (item.to === '/owner') return currentUser.role === 'owner';
    if (item.to === '/agency') return currentUser.role === 'agency';
    if (item.to === '/admin') return false;
    return true;
  });

  // `returnFocus` sends the caret back to the hamburger, which is the only
  // header control still on screen once the panel is gone.
  const closeMenu = useCallback((returnFocus = false) => {
    setMenuOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // A disclosure, not a modal: no focus trap. Focus lands on the panel itself so
  // the next Tab walks into the links, and Escape hands focus back to the toggle.
  useEffect(() => {
    if (!menuOpen) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // Navigating away must never leave the panel covering the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Widening past the breakpoint restores the inline nav, so drop the panel.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Every target is a route that exists in App.tsx. Portal links are entry points:
  // ProtectedRoute sends anyone without the right role to the login page.
  const footerColumns = [
    {
      id: 'footer-book',
      heading: 'Book a boat',
      links: [
        { to: '/', label: 'Browse boats' },
        ...(currentUser ? [{ to: '/trips', label: 'My trips' }] : []),
      ],
    },
    {
      id: 'footer-partners',
      heading: 'For partners',
      links: [
        { to: '/hotel', label: 'Hotel portal' },
        { to: '/owner', label: 'Boat owner portal' },
        { to: '/agency', label: 'Agency portal' },
      ],
    },
    {
      id: 'footer-account',
      heading: 'Your account',
      links: currentUser
        ? []
        : [
            { to: '/login', label: 'Log in' },
            { to: '/signup', label: 'Sign up' },
            { to: '/forgot-password', label: 'Reset your password' },
          ],
    },
  ];

  const panelTransition = { duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' as const };

  return (
    // `isolate` makes the root a stacking context, so the -z-10 page layers below
    // paint over its lake-50 fill but under everything else on the page.
    <div className="relative isolate min-h-svh flex flex-col bg-lake-50">
      {/* The page background is never a flat fill: a faint water texture over
          lake-50, deepening to a lake-100 tint at the foot of the page. At 5%
          lake-600 the texture lines leave lake-600 text at 5.3:1 (6.3:1 on plain
          lake-50), and the tint stays paler than lake-100, where it is 5.2:1. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-lake-50 via-lake-50 to-lake-100/70" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 water-texture bg-lake-600/5" />
      <header className="sticky top-0 z-40 border-b border-lake-100 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[72px] lg:gap-6">
          <NavLink
            to="/"
            className="flex shrink-0 items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2"
          >
            <BrandMark height={34} />
            <span className="whitespace-nowrap text-base font-bold tracking-tight text-lake-950 sm:text-lg">
              Kariba Lake Connect
            </span>
          </NavLink>

          {/* Desktop nav. The active route is marked by an orange bar on the header's
              bottom edge, drawn by the link itself, so no shared layoutId is needed. */}
          <nav aria-label="Primary" className="hidden self-stretch lg:flex lg:items-stretch lg:gap-6 xl:gap-8">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex items-center whitespace-nowrap text-sm font-medium outline-none transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:transition-colors focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 ${
                    isActive
                      ? 'text-lake-950 after:bg-sunset-500'
                      : 'text-lake-700 after:bg-transparent hover:text-lake-950 hover:after:bg-lake-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {currentUser ? (
            <div className="hidden shrink-0 items-center gap-3 lg:flex">
              <div className="min-w-0 text-right leading-tight">
                <p className="max-w-[10rem] truncate text-sm font-semibold text-lake-950">{currentUser.name}</p>
                <p className="text-xs capitalize text-lake-600">{currentUser.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-md border border-lake-200 px-3 py-2 text-sm font-medium text-lake-700 outline-none transition-colors hover:bg-lake-50 hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2"
              >
                <LogOut size={14} /> <span>Log out</span>
              </button>
            </div>
          ) : (
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <NavLink
                to="/login"
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-lake-700 outline-none transition-colors hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2"
              >
                Log in
              </NavLink>
              {/* Navy text, not white: white on this orange is 3.1:1, navy is 5.1:1. */}
              <NavLink
                to="/signup"
                className="whitespace-nowrap rounded-md bg-sunset-500 px-5 py-2.5 text-sm font-bold text-lake-950 outline-none transition-colors hover:bg-sunset-400 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2"
              >
                Sign up
              </NavLink>
            </div>
          )}

          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
            aria-label={menuOpen ? 'Close main menu' : 'Open main menu'}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-lake-200 text-lake-700 outline-none transition-colors hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 lg:hidden"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* The wrapper is always mounted so `aria-controls` always resolves. */}
        <div id={MENU_ID} className="lg:hidden">
          <AnimatePresence initial={false}>
            {menuOpen && (
              <motion.div
                key="panel"
                ref={panelRef}
                tabIndex={-1}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={panelTransition}
                className="overflow-hidden border-t border-lake-100 bg-white outline-none"
              >
                <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3">
                  <nav aria-label="Primary, mobile" className="flex flex-col gap-1">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => closeMenu(true)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-md border-l-4 px-3 py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lake-500 ${
                            isActive
                              ? 'border-sunset-500 bg-lake-50 text-lake-950'
                              : 'border-transparent text-lake-700 hover:bg-lake-50 hover:text-lake-950'
                          }`
                        }
                      >
                        <item.icon size={16} className="shrink-0" />
                        {item.label}
                      </NavLink>
                    ))}
                  </nav>

                  <div className="mt-3 border-t border-lake-100 pt-3">
                    {currentUser ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 leading-tight">
                          <p className="truncate text-sm font-semibold text-lake-950">{currentUser.name}</p>
                          <p className="text-xs capitalize text-lake-600">{currentUser.role}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu(true);
                            handleLogout();
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-lake-200 px-4 py-2.5 text-sm font-medium text-lake-700 outline-none transition-colors hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500"
                        >
                          <LogOut size={14} /> Log out
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <NavLink
                          to="/login"
                          onClick={() => closeMenu(true)}
                          className="rounded-md border border-lake-200 px-4 py-3 text-center text-sm font-medium text-lake-700 outline-none transition-colors hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500"
                        >
                          Log in
                        </NavLink>
                        <NavLink
                          to="/signup"
                          onClick={() => closeMenu(true)}
                          className="rounded-md bg-sunset-500 px-4 py-3 text-center text-sm font-bold text-lake-950 outline-none transition-colors hover:bg-sunset-400 focus-visible:ring-2 focus-visible:ring-lake-500"
                        >
                          Sign up
                        </NavLink>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Scrim sits under the z-40 header but over the page, so tapping the page
          dismisses the panel instead of the panel sitting there permanently. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="scrim"
            aria-hidden="true"
            onClick={() => closeMenu(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
            className="fixed inset-0 z-30 bg-lake-950/25 lg:hidden"
          />
        )}
      </AnimatePresence>

      <main className="flex-1">{children}</main>

      {/* Navy with depth rather than a flat fill: a lake-800 glow from the top
          right and the shared water texture in white at 6%. The lightest point
          the two reach is about lake-800 plus 6% white, where lake-200 is still
          5.8:1 and white 12.7:1. */}
      <footer className="relative isolate overflow-hidden bg-lake-950 text-lake-200">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_90%_at_100%_0%,var(--color-lake-800),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 water-texture bg-white/6" />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-12">
            <div className="sm:col-span-2 lg:col-span-1">
              {/* The emblem's boat is navy, so it sits on a white tile to stay visible. */}
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-md bg-white p-1.5">
                  <BrandMark height={32} />
                </span>
                <p className="text-lg font-bold tracking-tight text-white">Kariba Lake Connect</p>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-lake-200">
                A booking site for verified boats on Lake Kariba, Zimbabwe, used by tourists, hotels, travel agencies
                and boat companies.
              </p>
            </div>

            {footerColumns.map((column) => (
              <nav key={column.id} aria-labelledby={column.id}>
                <h2 id={column.id} className="text-xs font-bold uppercase tracking-wider text-white">
                  {column.heading}
                </h2>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className={footerLinkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {column.id === 'footer-account' && currentUser && (
                    <li>
                      <button type="button" onClick={handleLogout} className={footerLinkClass}>
                        Log out
                      </button>
                    </li>
                  )}
                </ul>
              </nav>
            ))}
          </div>

          <div className="mt-12 flex flex-col gap-2 border-t border-white/15 pt-6 text-xs text-lake-200 sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} Kariba Lake Connect. All rights reserved.</p>
            <p>Lake Kariba, Zimbabwe</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
