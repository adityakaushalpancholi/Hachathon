import { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, AlertCircle, ShieldCheck, User } from 'lucide-react';
import { SectionHeader, Spinner } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime } from '../lib/format.js';

const MIN = 8;

/**
 * Scores a password the same way the server does, so the meter and the rule
 * that actually gates submission cannot disagree. It is a hint, not the
 * decision — the server re-runs its own policy on every request regardless.
 */
function score(value) {
  if (!value) return 0;
  let n = 0;
  if (value.length >= MIN) n += 1;
  if (value.length >= 12) n += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) n += 1;
  if (/\d/.test(value) && /[^a-zA-Z0-9]/.test(value)) n += 1;
  return Math.min(n, 4);
}

const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
const BARS = [
  'bg-navy-200',
  'bg-red-500',
  'bg-saffron-500',
  'bg-coop-400',
  'bg-coop-600',
];

function PasswordField({ id, label, value, onChange, autoComplete, meter = false }) {
  const [reveal, setReveal] = useState(false);
  const strength = score(value);

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative mt-1.5">
        <Lock
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
        />
        <input
          id={id}
          type={reveal ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
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

      {meter && value && (
        <div className="mt-2">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < strength ? BARS[strength] : 'bg-navy-100'
                }`}
              />
            ))}
          </div>
          <p className="muted mt-1.5 text-xs">
            {LABELS[strength]} · at least {MIN} characters, mixing letters and numbers
          </p>
        </div>
      )}
    </div>
  );
}

export default function Account() {
  const { user, account, changePassword } = useAuth();
  const toast = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current && next.length >= MIN && next === confirm && !busy;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await changePassword({ currentPassword: current, newPassword: next });
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionHeader title="Account" hint="Who you are signed in as, and your password." />

      {/* ------------------------------- identity ------------------------------ */}
      <section className="card-pad">
        <div className="flex items-start gap-4">
          <div className="h-fit rounded-xl bg-navy-100 p-3 text-navy-700">
            <User size={20} />
          </div>
          <dl className="grid flex-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-navy-400">Name</dt>
              <dd className="mt-0.5 font-semibold text-navy-900">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                Mobile
              </dt>
              <dd className="tnum mt-0.5 font-semibold text-navy-900">{user?.phone}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-navy-400">Panel</dt>
              <dd className="mt-0.5 font-semibold text-navy-900">
                {account?.label}
                {account?.isOwner && (
                  <span className="badge-coop ml-2">
                    <ShieldCheck size={11} /> Owner
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                Password last changed
              </dt>
              <dd className="mt-0.5 font-semibold text-navy-900">
                {account?.passwordChangedAt ? formatDateTime(account.passwordChangedAt) : '—'}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ------------------------------- password ------------------------------ */}
      <section className="card-pad">
        <div className="flex items-center gap-2.5">
          <KeyRound size={17} className="text-navy-700" />
          <h2 className="font-bold tracking-tight text-navy-900">Change password</h2>
        </div>
        <p className="muted mt-1.5 text-sm">
          Your current password is required. That is what stops someone who picks up an unlocked
          phone from locking you out of your own account.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <PasswordField
            id="current"
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />

          <PasswordField
            id="next"
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            meter
          />

          <PasswordField
            id="confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />

          {mismatch && <p className="text-xs text-red-700">The two new passwords do not match.</p>}

          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <button type="submit" disabled={!ready} className="btn-primary disabled:opacity-50">
            {busy ? <Spinner size={16} /> : <KeyRound size={16} />} Change password
          </button>
        </form>
      </section>

      <p className="muted text-xs leading-relaxed">
        Passwords are stored as bcrypt hashes at cost 12 and never in readable form. Five wrong
        sign-in attempts lock the account, and each further round doubles the wait — the lock sits
        on the account rather than the address it came from, so spreading attempts across machines
        does not get around it.
      </p>
    </div>
  );
}
