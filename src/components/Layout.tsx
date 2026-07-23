import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Anchor, Building2, ClipboardCheck, ShieldCheck, LogOut, Ticket, Briefcase } from 'lucide-react';
import { useAuth } from '../data/AuthContext';

const allNavItems = [
  { to: '/', label: 'Browse Boats', icon: Anchor, end: true },
  { to: '/trips', label: 'My Trips', icon: Ticket },
  { to: '/hotel', label: 'Hotel Portal', icon: Building2 },
  { to: '/owner', label: 'Owner Portal', icon: ClipboardCheck },
  { to: '/agency', label: 'Agency Portal', icon: Briefcase },
  { to: '/admin', label: 'Admin', icon: ShieldCheck },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = allNavItems.filter((item) => {
    if (item.to === '/') return true;
    // Admin is oversight only: Browse Boats and the Admin panel, nothing else.
    if (currentUser?.role === 'admin') return item.to === '/admin';
    if (item.to === '/trips') return !!currentUser;
    if (!currentUser) return true;
    if (item.to === '/hotel') return currentUser.role === 'hotel';
    if (item.to === '/owner') return currentUser.role === 'owner';
    if (item.to === '/agency') return currentUser.role === 'agency';
    if (item.to === '/admin') return false;
    return true;
  });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-svh flex flex-col bg-lake-50">
      <header className="sticky top-0 z-40 border-b border-lake-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <motion.div
              whileHover={{ rotate: -8, scale: 1.05 }}
              className="grid h-9 w-9 place-items-center rounded-xl bg-lake-700 text-white"
            >
              <Anchor size={18} />
            </motion.div>
            <div className="leading-tight text-left">
              <p className="font-semibold text-lake-950 text-sm sm:text-base">Kariba Lake Access</p>
              <p className="text-[11px] text-lake-500 hidden sm:block">Verified boat bookings</p>
            </div>
          </NavLink>

          <nav className="flex items-center gap-1 rounded-full bg-lake-100/70 p-1 overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
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
                    <span className="relative z-10 hidden sm:inline">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {currentUser ? (
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block text-right leading-tight">
                <p className="text-xs font-semibold text-lake-950">{currentUser.name}</p>
                <p className="text-[11px] capitalize text-lake-500">{currentUser.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-full border border-lake-100 px-3 py-1.5 text-xs font-medium text-lake-600 hover:bg-lake-50"
              >
                <LogOut size={13} /> <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
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
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-lake-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 text-xs text-lake-500 flex flex-col sm:flex-row justify-between gap-2">
          <p>© {new Date().getFullYear()} Kariba Lake Access. Verified boat bookings on Lake Kariba.</p>
          <p>Built for tourists, hotels, boat owners, and travel agencies across Kariba, Zimbabwe.</p>
        </div>
      </footer>
    </div>
  );
}
