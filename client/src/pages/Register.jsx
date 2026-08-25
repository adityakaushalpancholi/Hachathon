import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserRound, Wrench, AlertCircle, ArrowRight } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { Spinner } from '../components/UI.jsx';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cooperatives as coopApi, services as serviceApi, areas as areaApi } from '../api/index.js';
import { inr } from '../lib/format.js';

/**
 * Sign-up.
 *
 * Choosing "member" is not a cosmetic switch: it provisions a Worker profile
 * attached to a company, in `pending` verification, which is exactly the
 * state the admin panel's queue exists to clear. Admin accounts are not
 * self-serve — admin comes from the deployment's own configuration.
 */
export default function Register() {
  const [role, setRole] = useState('customer');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    cooperativeId: '',
    skillTags: [],
    hourlyRate: '',
    experienceYears: '',
    city: 'Mumbai',
    zone: '',
  });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serviceAreas, setServiceAreas] = useState([]);

  /* The area list is what dispatch matches on, so signup offers exactly those
     rather than a free-text city that the engine has never heard of. */
  useEffect(() => {
    let alive = true;
    areaApi
      .list()
      .then((list) => {
        if (!alive) return;
        setServiceAreas(list);
        setForm((f) => ({ ...f, zone: f.zone || list[0]?.zone || '' }));
      })
      .catch(() => {
        /* leaving it empty falls back to the company location, as before */
      });
    return () => {
      alive = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [coops, setCoops] = useState([]);
  const [skills, setSkills] = useState([]);

  const { register, isAuthenticated, role: currentRole } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // Reference data for the professional form.
  useEffect(() => {
    if (role !== 'worker') return;
    Promise.all([coopApi.list(), serviceApi.list({ limit: 50 })])
      .then(([c, s]) => {
        setCoops(c);
        setSkills(s);
        setForm((f) => ({ ...f, cooperativeId: f.cooperativeId || c[0]?._id || '' }));
      })
      .catch(() => {
        /* the form still submits; the server picks a company by city */
      });
  }, [role]);

  if (isAuthenticated) return <Navigate to={HOME_FOR_ROLE[currentRole] ?? '/app'} replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleSkill = (tag) =>
    setForm((f) => ({
      ...f,
      skillTags: f.skillTags.includes(tag)
        ? f.skillTags.filter((t) => t !== tag)
        : [...f.skillTags, tag],
    }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);

    const payload = {
      name: form.name.trim(),
      phone: form.phone,
      password: form.password,
      role,
      ...(form.email ? { email: form.email.trim() } : {}),
    };

    if (role === 'worker') {
      Object.assign(payload, {
        city: baseArea?.city ?? form.city,
        /* Without this the server falls back to the company's own coordinates,
           which puts every new professional on the map at head office —
           outside the radius of most customers actually near them. */
        ...(baseArea
          ? { location: { lat: baseArea.lat, lng: baseArea.lng }, city: baseArea.city }
          : {}),
        ...(form.cooperativeId ? { cooperativeId: form.cooperativeId } : {}),
        ...(form.skillTags.length ? { skillTags: form.skillTags } : {}),
        ...(form.hourlyRate ? { hourlyRate: Number(form.hourlyRate) } : {}),
        ...(form.experienceYears ? { experienceYears: Number(form.experienceYears) } : {}),
      });
    }

    try {
      const session = await register(payload);
      toast.success(
        role === 'worker'
          ? 'Welcome. We will review your documents before you can take jobs.'
          : `Welcome to ShramSetu, ${session.user.name.split(' ')[0]}`,
      );
      navigate(HOME_FOR_ROLE[session.panel] ?? '/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fieldErrors ?? {});
    } finally {
      setBusy(false);
    }
  };

  const selectedCoop = coops.find((c) => c._id === form.cooperativeId);
  const baseArea = serviceAreas.find((a) => a.zone === form.zone);
  const err = (field) => fieldErrors[field];

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6 lg:py-14">
      <div className="mb-8 lg:hidden">
        <Logo />
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-navy-900">Create an account</h1>
      <p className="muted mt-1.5">This choice decides which panel you get.</p>

      {/* ----------------------------- role ------------------------------ */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          {
            key: 'customer',
            icon: UserRound,
            title: 'I need a service',
            blurb: 'Book verified pros',
          },
          {
            key: 'worker',
            icon: Wrench,
            title: 'I do the work',
            blurb: 'Take bookings',
          },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRole(opt.key)}
            className={`rounded-xl border-2 p-4 text-left transition ${
              role === opt.key
                ? 'border-navy-900 bg-navy-900 text-white'
                : 'border-navy-200 bg-white hover:border-navy-300'
            }`}
          >
            <opt.icon size={20} className={role === opt.key ? 'text-coop-400' : 'text-navy-400'} />
            <p className="mt-2 text-sm font-bold">{opt.title}</p>
            <p className={`mt-0.5 text-xs ${role === opt.key ? 'text-navy-300' : 'text-navy-500'}`}>
              {opt.blurb}
            </p>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" value={form.name} onChange={set('name')} className="input" required minLength={2} />
          {err('name') && <p className="mt-1 text-xs text-red-600">{err('name')}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="reg-phone" className="label">Mobile number</label>
            <input
              id="reg-phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
              placeholder="9876543210"
              className="input"
              required
            />
            {err('phone') && <p className="mt-1 text-xs text-red-600">{err('phone')}</p>}
          </div>

          <div>
            <label htmlFor="reg-pass" className="label">Password</label>
            <input
              id="reg-pass"
              type="password"
              value={form.password}
              onChange={set('password')}
              className="input"
              required
              minLength={6}
            />
            {err('password') && <p className="mt-1 text-xs text-red-600">{err('password')}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="reg-email" className="label">Email <span className="font-normal normal-case text-navy-400">(optional)</span></label>
          <input id="reg-email" type="email" value={form.email} onChange={set('email')} className="input" />
        </div>

        {/* -------------------------- member only ------------------------ */}
        {role === 'worker' && (
          <div className="space-y-4 rounded-xl border border-coop-200 bg-coop-50/50 p-4">
            <p className="text-sm font-bold text-coop-900">Membership details</p>

            <div>
              <label htmlFor="coop" className="label">Company to join</label>
              <select id="coop" value={form.cooperativeId} onChange={set('cooperativeId')} className="select">
                {coops.length === 0 && <option value="">Nearest company</option>}
                {coops.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} — {c.city} ({c.stats.memberCount} members)
                  </option>
                ))}
              </select>
              {selectedCoop && (
                <p className="mt-1.5 text-xs text-coop-800">
                  {Math.round(selectedCoop.governance.commissionPct * 100)}% commission · rate floor{' '}
                  Rate floor {inr(selectedCoop.governance.minHourlyRate)}/hr ·{' '}
                  {Math.round(selectedCoop.governance.commissionPct * 100)}% commission
                </p>
              )}
            </div>

            <div>
              <span className="label">Your trades</span>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => toggleSkill(s.skillTag)}
                    className={`badge border transition ${
                      form.skillTags.includes(s.skillTag)
                        ? 'border-coop-600 bg-coop-600 text-white'
                        : 'border-navy-200 bg-white text-navy-600 hover:border-coop-300'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="rate" className="label">Hourly rate</label>
                <input
                  id="rate"
                  type="number"
                  min={selectedCoop?.governance.minHourlyRate ?? 0}
                  value={form.hourlyRate}
                  onChange={set('hourlyRate')}
                  placeholder={String(selectedCoop?.governance.minHourlyRate ?? 200)}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="exp" className="label">Years</label>
                <input id="exp" type="number" min="0" max="60" value={form.experienceYears} onChange={set('experienceYears')} className="input" />
              </div>
              <div>
                <label htmlFor="basearea" className="label">Where you work</label>
                <select
                  id="basearea"
                  value={form.zone}
                  onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                  className="select"
                >
                  {serviceAreas.length === 0 && <option value="">Loading…</option>}
                  {serviceAreas.map((a) => (
                    <option key={a.zone} value={a.zone}>
                      {a.zone} · {a.city}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="border-t border-coop-200 pt-3 text-xs leading-relaxed text-coop-800">
              You will join as <strong>pending</strong>. An administrator
              reviews your documents before you can go online and take jobs. A person reads
              every file; this is not an automated check.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner size={16} /> : <ArrowRight size={16} />}
          {busy ? 'Creating…' : `Create ${role === 'worker' ? 'member' : 'customer'} account`}
        </button>
      </form>

      <p className="muted mt-6 text-center">
        Already registered?{' '}
        <Link to="/login" className="font-semibold text-coop-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
