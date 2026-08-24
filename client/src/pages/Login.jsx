import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Phone, Lock, AlertCircle, UserRound, Wrench, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { Spinner } from '../components/UI.jsx';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Demo accounts, one per panel.
 *
 * The worker number is the first seeded member and is stable because the seed
 * uses a fixed PRNG — see server/src/seed/seed.js.
 */
const DEMO = [
  {
    role: 'customer',
    icon: UserRound,
    name: 'Aditya Rao',
    phone: '9876543210',
    password: 'customer123',
    blurb: 'Book services, track a job live, rate a member',
    accent: 'border-navy-200 hover:border-navy-400',
  },
  {
    role: 'worker',
    icon: Wrench,
    name: 'Ramesh Patil',
    phone: '9000000001',
    password: 'worker123',
    blurb: 'Take job offers, run the OTP flow, see earnings',
    accent: 'border-coop-200 hover:border-coop-400',
  },
  {
    role: 'admin',
    icon: ShieldCheck,
    name: 'Anjali Deshpande',
    phone: '9876500001',
    password: 'admin123',
    blurb: 'Verify members, run settlement, read demand',
    accent: 'border-saffron-200 hover:border-saffron-400',
  },
];

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { login, isAuthenticated, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  if (isAuthenticated) {
    return <Navigate to={location.state?.from || HOME_FOR_ROLE[role] || '/app'} replace />;
  }

  const submit = async (e, creds) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);

    const p = creds?.phone ?? phone;
    const pw = creds?.password ?? password;

    try {
      const session = await login(p, pw);
      toast.success(`Signed in as ${session.user.name}`);
      // The server decides the panel; we simply follow it.
      navigate(location.state?.from || HOME_FOR_ROLE[session.panel] || '/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-16">
      {/* ------------------------------ form ------------------------------ */}
      <div className="mx-auto w-full max-w-sm lg:mx-0">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-navy-900">Sign in</h1>
        <p className="muted mt-1.5">
          Your account decides which panel opens — customer, member or board.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <div>
            <label htmlFor="phone" className="label">
              Mobile number
            </label>
            <div className="relative">
              <Phone
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
              />
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                className="input pl-9"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
              />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input pl-9"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner size={16} /> : <LogIn size={16} />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="muted mt-6 text-center">
          No account?{' '}
          <Link to="/register" className="font-semibold text-coop-700 hover:underline">
            Create one
          </Link>
        </p>
      </div>

      {/* -------------------------- demo accounts ------------------------- */}
      <div className="lg:pl-8">
        <div className="rounded-2xl border border-navy-100 bg-navy-50/70 p-5 sm:p-6">
          <p className="text-sm font-bold text-navy-900">Try each panel</p>
          <p className="muted mt-1">
            Three accounts, three completely different surfaces. Each one loads its own data from
            its own role-scoped endpoints.
          </p>

          <div className="mt-5 space-y-2.5">
            {DEMO.map((d) => (
              <button
                key={d.role}
                onClick={(e) => submit(e, d)}
                disabled={busy}
                className={`flex w-full items-center gap-3.5 rounded-xl border bg-white p-3.5 text-left transition hover:shadow-card disabled:opacity-60 ${d.accent}`}
              >
                <div className="shrink-0 rounded-lg bg-navy-900 p-2.5 text-white">
                  <d.icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-bold capitalize text-navy-900">{d.role}</p>
                    <p className="truncate text-xs text-navy-400">{d.name}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-navy-500">{d.blurb}</p>
                  <p className="tnum mt-1 font-mono text-[11px] text-navy-400">
                    {d.phone} · {d.password}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <p className="mt-5 border-t border-navy-200 pt-4 text-xs leading-relaxed text-navy-500">
            Signing in returns a JWT whose <code className="font-mono text-navy-700">role</code>{' '}
            claim selects the panel. Every panel endpoint re-checks that claim server-side, so
            editing the stored token changes nothing except which screen fails.
          </p>
        </div>
      </div>
    </div>
  );
}
