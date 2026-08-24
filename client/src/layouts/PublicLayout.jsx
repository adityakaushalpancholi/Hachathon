import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';

const LINKS = [
  { to: '/browse', label: 'Services' },
  { to: '/browse?view=members', label: 'Our members' },
];

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, role, user } = useAuth();
  const panelHref = HOME_FOR_ROLE[role] ?? '/app';

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3.5 sm:px-6">
          <Logo />

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-navy-100 text-navy-900' : 'text-navy-600 hover:bg-navy-50'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <Link to={panelHref} className="btn-primary">
                {user?.name?.split(' ')[0]}&rsquo;s panel <ArrowRight size={15} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary">
                  Get started
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setOpen((o) => !o)}
            className="btn-ghost -mr-2 ml-auto p-2 md:hidden"
            aria-label="Menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {open && (
          <div className="border-t border-navy-100 bg-white px-4 py-3 md:hidden">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="nav-link w-full"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-3 flex gap-2 border-t border-navy-100 pt-3">
              {isAuthenticated ? (
                <Link to={panelHref} className="btn-primary flex-1">
                  Go to my panel
                </Link>
              ) : (
                <>
                  <Link to="/login" className="btn-outline flex-1">
                    Sign in
                  </Link>
                  <Link to="/register" className="btn-primary flex-1">
                    Get started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-navy-100 bg-navy-950 text-navy-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="text-lg font-extrabold text-white">
                Shram<span className="text-coop-400">Setu</span>
              </span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed">
              A service marketplace owned by the people who do the work. Members elect the board,
              set the rate floor, and share the surplus the platform generates.
            </p>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-white">Platform</p>
            <ul className="space-y-2 text-sm">
              <li><Link to="/browse" className="hover:text-white">Browse services</Link></li>
              <li><Link to="/register" className="hover:text-white">Join as a member</Link></li>
              <li><Link to="/login" className="hover:text-white">Sign in</Link></li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-white">
              How we differ
            </p>
            <ul className="space-y-2 text-sm">
              <li>8% commission, not 25%</li>
              <li>Surplus returned as dividend</li>
              <li>Collectively set rate floor</li>
              <li>Members verify members</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-navy-800 px-4 py-5 text-center text-xs text-navy-400 sm:px-6">
          Built as a cooperative-ownership prototype. Demo data only.
        </div>
      </footer>
    </div>
  );
}
