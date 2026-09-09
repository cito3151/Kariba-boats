import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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

// The brand block, five role-filtered nav items and the auth controls cannot all
// share one row at phone widths -- the nav gets squeezed to a few unusable pixels.
// Below this width the nav and auth controls move into a disclosure panel under
// the header; at and above it the original single-row desktop header is used.
const DESKTOP_QUERY = '(min-width: 1024px)'; // Tailwind `lg`
const MENU_ID = 'primary-mobile-menu';

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
    // the pill should not be there at all, and dropping it also takes the
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

  const panelTransition = { duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' as const };

  return (
    <div className="min-h-svh flex flex-col bg-lake-50">
      <header className="sticky top-0 z-40 border-b border-lake-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3 lg:gap-4">
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <motion.div whileHover={{ scale: 1.04 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <BrandMark height={34} />
            </motion.div>
            <div className="leading-tight text-left">
              <p className="font-semibold text-lake-950 text-sm sm:text-base">Kariba Lake Connect</p>
              <p className="text-[11px] text-lake-500 hidden sm:block">Verified boat bookings</p>
            </div>
          </NavLink>

          {/* Desktop nav. Sole owner of the `nav-pill` layoutId -- see the panel below. */}
          <nav
            aria-label="Primary"
            className="hidden lg:flex items-center gap-1 rounded-full bg-lake-100/70 p-1 overflow-x-auto"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs xl:px-3 xl:text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive ? 'text-white' : 'text-lake-700 hover:text-lake-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-lake-700"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                    <item.icon size={14} className="relative z-10" />
                    <span className="relative z-10">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {currentUser ? (
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <div className="text-right leading-tight">
                <p className="text-xs font-semibold text-lake-950">{currentUser.name}</p>
                <p className="text-[11px] capitalize text-lake-500">{currentUser.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-full border border-lake-100 px-3 py-1.5 text-xs font-medium text-lake-600 hover:bg-lake-50"
              >
                <LogOut size={13} /> <span>Log out</span>
              </button>
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <NavLink
                to="/login"
                className="rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium text-lake-700 hover:text-lake-900 whitespace-nowrap"
              >
                Log in
              </NavLink>
              <NavLink
                to="/signup"
                className="rounded-full bg-sunset-500 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-sunset-600 whitespace-nowrap"
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
            className="lg:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-lake-100 text-lake-700 outline-none transition-colors hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2"
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
                  {/* No `nav-pill` layoutId here: the desktop nav keeps that id even
                      while hidden, and two live holders of one layoutId make the
                      shared-layout animation fight itself. The panel closes on
                      navigation anyway, so a sliding pill would never be seen. */}
                  <nav aria-label="Primary, mobile" className="flex flex-col gap-1">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => closeMenu(true)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lake-500 ${
                            isActive ? 'bg-lake-700 text-white' : 'text-lake-700 hover:bg-lake-50'
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
                          <p className="text-xs capitalize text-lake-500">{currentUser.role}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu(true);
                            handleLogout();
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-lake-100 px-4 py-2.5 text-xs font-medium text-lake-600 outline-none transition-colors hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500"
                        >
                          <LogOut size={14} /> Log out
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <NavLink
                          to="/login"
                          onClick={() => closeMenu(true)}
                          className="rounded-full border border-lake-100 px-4 py-3 text-center text-sm font-medium text-lake-700 outline-none transition-colors hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500"
                        >
                          Log in
                        </NavLink>
                        <NavLink
                          to="/signup"
                          onClick={() => closeMenu(true)}
                          className="rounded-full bg-sunset-500 px-4 py-3 text-center text-sm font-semibold text-white outline-none transition-colors hover:bg-sunset-600 focus-visible:ring-2 focus-visible:ring-lake-500"
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

      <footer className="border-t border-lake-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 text-xs text-lake-500 flex flex-col sm:flex-row justify-between gap-2">
          <p>© {new Date().getFullYear()} Kariba Lake Connect. Verified boat bookings on Lake Kariba.</p>
          <p>Built for tourists, hotels, boat owners, and travel agencies across Kariba, Zimbabwe.</p>
        </div>
      </footer>
    </div>
  );
}
