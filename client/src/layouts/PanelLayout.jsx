import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Menu, X, LogOut, ChevronDown, Building2 } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { Avatar } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PANEL_META } from '../lib/nav.jsx';

/**
 * Shared chrome for all three panels.
 *
 * The nav items come from `lib/nav.jsx` per panel, so this file has no idea
 * which role it is rendering — it only knows the shape of a nav entry. That
 * keeps the customer, worker and admin panels visually identical in structure
 * while their contents differ entirely.
 */
export default function PanelLayout({ nav, panel }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, account, cooperative, workerProfile, isOwner, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const meta = PANEL_META[panel];
  // The server names the panel; PANEL_META is only the fallback for a session
  // rehydrated before the API answered.
  const panelTitle = account?.label ?? meta.title;
  const items = nav.filter((item) => !item.ownerOnly || isOwner);
  const accentBar = {
    customer: 'bg-navy-900',
    worker: 'bg-coop-600',
    admin: 'bg-saffron-500',
  }[panel];

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navItems = (
    <nav className="space-y-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <item.icon size={17} className="shrink-0" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  const orgCard = (
    <div className="rounded-lg border border-navy-100 bg-navy-50/60 p-3">
      <div className="flex items-center gap-2 text-navy-500">
        <Building2 size={13} />
        <span className="text-[10px] font-bold uppercase tracking-wider">Cooperative</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold leading-tight text-navy-900">
        {cooperative?.name ?? workerProfile?.cooperative?.name ?? 'ShramSetu Network'}
      </p>
      {user?.membershipId && (
        <p className="tnum mt-1 font-mono text-[11px] text-navy-400">{user.membershipId}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-50">
      {/* Panel accent — a one-glance cue for which panel you are in. */}
      <div className={`h-1 w-full ${accentBar}`} />

      <div className="mx-auto flex max-w-[1440px]">
        {/* ---------------------------- sidebar ---------------------------- */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-navy-100 bg-white lg:flex">
          <div className="px-5 py-5">
            <Logo />
          </div>

          <div className="px-3">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-navy-400">
              {panelTitle} panel
            </p>
            {navItems}
          </div>

          <div className="mt-auto space-y-3 p-3">
            {orgCard}
            <button onClick={signOut} className="nav-link w-full text-navy-500">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </aside>

        {/* ----------------------------- main ------------------------------ */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-navy-100 bg-white/85 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <button
                onClick={() => setMobileOpen(true)}
                className="btn-ghost -ml-2 p-2 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>

              <div className="lg:hidden">
                <Logo showText={false} size={28} />
              </div>

              <div className="hidden min-w-0 flex-1 lg:block">
                <p className="truncate text-sm font-semibold text-navy-900">
                  Welcome back, {user?.name?.split(' ')[0]}
                </p>
                <p className="truncate text-xs text-navy-500">
                  {panelTitle} panel · signed in as {user?.phone}
                  {account?.isOwner && ' · platform owner'}
                </p>
              </div>

              <div className="ml-auto flex items-center gap-1">
                <NotificationBell />

                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                    className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-navy-100"
                  >
                    <Avatar name={user?.name} size={30} />
                    <ChevronDown size={14} className="text-navy-400" />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 z-40 mt-2 w-56 animate-fade-up rounded-xl border border-navy-100 bg-white p-1.5 shadow-lift">
                      <div className="border-b border-navy-100 px-3 py-2.5">
                        <p className="truncate text-sm font-semibold text-navy-900">{user?.name}</p>
                        <p className="truncate text-xs text-navy-500">{user?.phone}</p>
                      </div>
                      <Link to="/" className="nav-link mt-1 w-full">
                        Public site
                      </Link>
                      <button onClick={signOut} className="nav-link w-full text-red-600 hover:bg-red-50">
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="px-4 py-6 pb-24 sm:px-6 lg:pb-10">
            {/* Keyed on the route so navigating away clears a caught error. */}
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* ------------------------- mobile drawer ------------------------- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white">
            <div className="flex items-center justify-between px-5 py-5">
              <Logo />
              <button onClick={() => setMobileOpen(false)} className="btn-ghost p-2" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="px-3">
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-navy-400">
                {meta.title} panel
              </p>
              {navItems}
            </div>
            <div className="mt-auto space-y-3 p-3">
              {orgCard}
              <button onClick={signOut} className="nav-link w-full text-navy-500">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ------------------- mobile bottom tab bar ----------------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-100 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex">
          {items.slice(0, 4).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
                  isActive ? 'text-navy-900' : 'text-navy-400'
                }`
              }
            >
              <item.icon size={19} />
              <span className="max-w-full truncate px-1">{item.label.split(' ')[0]}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
