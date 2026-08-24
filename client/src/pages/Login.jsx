import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LogIn,
  Phone,
  Lock,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { Spinner } from '../components/UI.jsx';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Sign in with a one-time code, or with a password for accounts that set one.
 *
 * The code path is primary because it is the only one that works for a first-time
 * user: verifying a number creates the account if it does not exist yet. That is
 * also why the name field appears on the code step — the request step answers
 * identically whether or not the number is registered, deliberately, so the
 * client genuinely does not know which case it is in until the code is checked.
 */

const CODE_LENGTH = 6;

export default function Login() {
  const [mode, setMode] = useState('otp'); // 'otp' | 'password'
  const [step, setStep] = useState('phone'); // 'phone' | 'code'

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const [devCode, setDevCode] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const codeRef = useRef(null);

  const { login, requestOtp, verifyOtp, isAuthenticated, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Resend countdown. The server enforces the real cooldown; this only stops the
  // user from spending an attempt to be told to wait.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  if (isAuthenticated) {
    return <Navigate to={location.state?.from || HOME_FOR_ROLE[role] || '/app'} replace />;
  }

  const land = (session) => {
    toast.success(`Signed in as ${session.user.name}`);
    // The server decides the panel; we simply follow it.
    navigate(location.state?.from || HOME_FOR_ROLE[session.panel] || '/app', { replace: true });
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(phone);
      setStep('code');
      setCode('');
      setCooldown(30);
      // Only ever present when the deployment has OTP_ECHO on, which production
      // refuses to boot with.
      setDevCode(res.devCode ?? null);
      toast.success(`Code sent to ${phone}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await verifyOtp({ phone, code, ...(name.trim() ? { name: name.trim() } : {}) });
      land(session);
    } catch (err) {
      setError(err.message);
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      land(await login(phone, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const errorBox = error && (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );

  const phoneField = (
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
          placeholder="10-digit number"
          className="input pl-9"
          required
        />
      </div>
    </div>
  );

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

        {/* --------------------------- code: step 1 -------------------------- */}
        {mode === 'otp' && step === 'phone' && (
          <>
            <form onSubmit={sendCode} className="mt-7 space-y-4">
              {phoneField}
              {errorBox}
              <button type="submit" disabled={busy || phone.length < 10} className="btn-primary w-full">
                {busy ? <Spinner size={16} /> : <MessageSquare size={16} />}
                {busy ? 'Sending…' : 'Send me a code'}
              </button>
            </form>

            <p className="muted mt-4 text-center text-xs">
              We text a {CODE_LENGTH}-digit code. No password needed — if the number is new, signing
              in creates the account.
            </p>

            <button
              type="button"
              onClick={() => {
                setMode('password');
                setError(null);
              }}
              className="mt-6 w-full text-center text-sm font-semibold text-coop-700 hover:underline"
            >
              Use a password instead
            </button>
          </>
        )}

        {/* --------------------------- code: step 2 -------------------------- */}
        {mode === 'otp' && step === 'code' && (
          <form onSubmit={submitCode} className="mt-7 space-y-4">
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setError(null);
                setDevCode(null);
              }}
              className="flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800"
            >
              <ArrowLeft size={14} /> {phone}
            </button>

            <div>
              <label htmlFor="code" className="label">
                Code from your phone
              </label>
              <div className="relative">
                <KeyRound
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
                />
                <input
                  id="code"
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="••••••"
                  className="input tnum pl-9 font-mono text-lg tracking-[0.4em]"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="name" className="label">
                Your name <span className="font-normal text-navy-400">— only if this is a new number</span>
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Leave blank if you already have an account"
                className="input"
              />
            </div>

            {devCode && (
              <div className="rounded-lg border border-saffron-200 bg-saffron-50 p-3 text-sm text-navy-800">
                <span className="font-semibold">Development mode:</span> your code is{' '}
                <code className="tnum font-mono font-bold">{devCode}</code>
              </div>
            )}

            {errorBox}

            <button type="submit" disabled={busy || code.length < 4} className="btn-primary w-full">
              {busy ? <Spinner size={16} /> : <LogIn size={16} />}
              {busy ? 'Checking…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={sendCode}
              disabled={busy || cooldown > 0}
              className="w-full text-center text-sm font-semibold text-coop-700 hover:underline disabled:text-navy-400 disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
            </button>
          </form>
        )}

        {/* ---------------------------- password ---------------------------- */}
        {mode === 'password' && (
          <form onSubmit={submitPassword} className="mt-7 space-y-4">
            {phoneField}

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

            {errorBox}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner size={16} /> : <LogIn size={16} />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('otp');
                setStep('phone');
                setError(null);
              }}
              className="w-full text-center text-sm font-semibold text-coop-700 hover:underline"
            >
              Sign in with a code instead
            </button>
          </form>
        )}

        <p className="muted mt-6 text-center">
          Joining as a cooperative member?{' '}
          <Link to="/register" className="font-semibold text-coop-700 hover:underline">
            Register here
          </Link>
        </p>
      </div>

      {/* ------------------------- how access works ------------------------ */}
      <div className="lg:pl-8">
        <div className="rounded-2xl border border-navy-100 bg-navy-50/70 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-navy-900 p-2 text-white">
              <ShieldCheck size={16} />
            </div>
            <p className="text-sm font-bold text-navy-900">How access works here</p>
          </div>

          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="font-semibold text-navy-900">Your number is the account</dt>
              <dd className="muted mt-0.5">
                A code proves you hold the phone. Codes are stored hashed, expire on their own, and
                are burned after a handful of wrong guesses.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-navy-900">The server picks your panel</dt>
              <dd className="muted mt-0.5">
                Signing in returns a JWT whose <code className="font-mono text-navy-700">role</code>{' '}
                claim selects the surface. Every endpoint re-checks that claim, so editing the
                stored token changes nothing except which screen fails.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-navy-900">Administration is not grantable</dt>
              <dd className="muted mt-0.5">
                No screen anywhere promotes an account. The admin role is derived from the
                deployment's own configuration on every request — a database with an{' '}
                <code className="font-mono text-navy-700">admin</code> row written into it still
                signs in as a customer.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
