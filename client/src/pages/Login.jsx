import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Phone, Lock, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { Spinner } from '../components/UI.jsx';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Sign in with a phone number and password.
 *
 * The error copy never distinguishes "no such account" from "wrong password" —
 * the server does not either. Telling them apart only helps someone working out
 * which numbers are registered; a person who owns the number already knows.
 */
export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { login, isAuthenticated, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Someone already holding a session is sent to their panel rather than being
  // shown a form they do not need — which is what keeps the public header's
  // permanent "Sign in" button useful to them instead of a dead end.
  if (isAuthenticated) {
    return <Navigate to={location.state?.from || HOME_FOR_ROLE[role] || '/app'} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const session = await login(phone.trim(), password);
      toast.success(`Welcome back, ${session.user.name.split(' ')[0]}`);
      navigate(location.state?.from || HOME_FOR_ROLE[session.panel] || '/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-2">
      {/* ------------------------------- the form ------------------------------ */}
      <div className="mx-auto w-full max-w-sm">
        <Logo />

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-navy-900">Sign in</h1>
        <p className="muted mt-2">
          Your account decides which panel opens — customer, professional or admin.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="phone" className="label">
              Mobile number
            </label>
            <div className="relative mt-1.5">
              <Phone
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
              />
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="username"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit number"
                className="input pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <div className="relative mt-1.5">
              <Lock
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
              />
              <input
                id="password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="input pl-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-navy-400 transition hover:bg-navy-100 hover:text-navy-700"
                aria-label={reveal ? 'Hide password' : 'Show password'}
              >
                {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || phone.length !== 10 || !password}
            className="btn-primary w-full justify-center py-2.5 disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : <LogIn size={16} />} Sign in
          </button>
        </form>

        <p className="muted mt-6 text-sm">
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-navy-900 hover:underline">
            Create one
          </Link>
        </p>
      </div>

      {/* ------------------------------ the sidebar ---------------------------- */}
      <div className="hidden lg:block">
        <div className="card-pad">
          <span className="badge-coop">
            <ShieldCheck size={12} /> How access works here
          </span>

          <dl className="mt-6 space-y-6">
            <div>
              <dt className="font-bold tracking-tight text-navy-900">
                Your number is your username
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-navy-600">
                Passwords are stored as bcrypt hashes and never in readable form — not in the
                database, not in a log, and not on any screen in this application.
              </dd>
            </div>

            <div>
              <dt className="font-bold tracking-tight text-navy-900">Guessing gets slower</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-navy-600">
                Five wrong attempts locks the account, and each further round doubles the wait.
                The lock sits on the account rather than the address it came from, so spreading
                the attempts across machines does not help.
              </dd>
            </div>

            <div>
              <dt className="font-bold tracking-tight text-navy-900">
                Administration is not grantable
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-navy-600">
                No screen anywhere promotes an account. The admin role comes from the
                deployment&rsquo;s own configuration and is re-checked on every request, so a
                database row edited to say &ldquo;admin&rdquo; still signs in as a customer.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
