import { useEffect, useState } from 'react';
import { UserRound, Save, AlertCircle, Clock, Languages, Wrench, Zap } from 'lucide-react';
import { workerPanel, services as serviceApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { Async, SectionHeader, Spinner } from '../../components/UI.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { inr } from '../../lib/format.js';
import WorkArea from './WorkArea.jsx';

const DAYS = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' },
  { n: 0, label: 'Sun' },
];

const LANGS = [
  { code: 'hi', label: 'Hindi' }, { code: 'en', label: 'English' },
  { code: 'mr', label: 'Marathi' }, { code: 'ta', label: 'Tamil' },
  { code: 'bn', label: 'Bengali' },
];

/**
 * A professional's own profile.
 *
 * Everything here is something only they can answer — what they do, what they
 * charge, when they work. Verification status, ratings and earnings are
 * deliberately absent: those are awarded by other people or derived from work
 * actually done, and an account that can edit its own badges is not a
 * verification system. The server enforces that separately; this simply does
 * not offer the fields.
 */
export default function EditProfile() {
  const { data, loading, error, reload } = useApi(() => workerPanel.dashboard(), []);
  const { data: catalogue } = useApi(() => serviceApi.list({ limit: 50 }), []);
  const { refresh } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const profile = data?.profile;

  useEffect(() => {
    if (!profile || form) return;
    setForm({
      displayName: profile.displayName ?? '',
      bio: profile.bio ?? '',
      hourlyRate: String(profile.hourlyRate ?? ''),
      experienceYears: String(profile.experienceYears ?? ''),
      languages: profile.languages ?? ['hi', 'en'],
      skillTags: (profile.skills ?? []).map((s) => s.skillTag),
      workingDays: profile.availability?.workingDays ?? [1, 2, 3, 4, 5, 6],
      shiftStart: profile.availability?.shiftStart ?? '08:00',
      shiftEnd: profile.availability?.shiftEnd ?? '20:00',
      acceptsEmergency: Boolean(profile.availability?.acceptsEmergency),
    });
  }, [profile, form]);

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const toggleIn = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const save = async (e) => {
    e.preventDefault();
    setProblem(null);

    if (!form.skillTags.length) return setProblem('Choose at least one trade.');
    if (!form.workingDays.length) return setProblem('Choose at least one working day.');
    if (!form.languages.length) return setProblem('Choose at least one language.');

    setBusy(true);
    try {
      const result = await workerPanel.updateProfile({
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        languages: form.languages,
        skillTags: form.skillTags,
        hourlyRate: Number(form.hourlyRate),
        experienceYears: Number(form.experienceYears),
        workingDays: form.workingDays,
        shiftStart: form.shiftStart,
        shiftEnd: form.shiftEnd,
        acceptsEmergency: form.acceptsEmergency,
      });

      // The server may adjust what it stored — say so rather than silently
      // showing a number the professional did not type.
      result.notes?.forEach((n) => toast.info?.(n) ?? toast.success(n));
      toast.success('Profile updated');
      await Promise.all([reload({ silent: true }), refresh()]);
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  const trades = catalogue ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionHeader
        title="Your profile"
        hint="What customers see, and when you are available for work."
      />

      <Async loading={loading} error={error} data={form} onRetry={reload}>
        {form && (
          <>
            <form onSubmit={save} className="space-y-6">
              {/* ---------------------------- about you --------------------------- */}
              <section className="card-pad space-y-4">
                <div className="flex items-center gap-2.5">
                  <UserRound size={17} className="text-navy-700" />
                  <h2 className="font-bold tracking-tight text-navy-900">About you</h2>
                </div>

                <div>
                  <label htmlFor="dn" className="label">Name customers see</label>
                  <input
                    id="dn" value={form.displayName} onChange={set('displayName')}
                    minLength={2} maxLength={80} required className="input mt-1.5"
                  />
                </div>

                <div>
                  <label htmlFor="bio" className="label">
                    About your work <span className="font-normal normal-case text-navy-400">(optional)</span>
                  </label>
                  <textarea
                    id="bio" value={form.bio} onChange={set('bio')} rows={3} maxLength={600}
                    placeholder="Twelve years on domestic wiring and switchboards. I carry my own tools and test everything before I leave."
                    className="input mt-1.5 resize-y"
                  />
                  <p className="muted mt-1 text-xs">{form.bio.length}/600</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="rate" className="label">Your hourly rate</label>
                    <input
                      id="rate" type="number" min="0" max="20000" value={form.hourlyRate}
                      onChange={set('hourlyRate')} className="input mt-1.5"
                    />
                    <p className="muted mt-1 text-xs">
                      Currently {inr(profile.hourlyRate)}/hr. Your company sets a minimum.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="exp" className="label">Years of experience</label>
                    <input
                      id="exp" type="number" min="0" max="60" value={form.experienceYears}
                      onChange={set('experienceYears')} className="input mt-1.5"
                    />
                  </div>
                </div>
              </section>

              {/* ------------------------------ trades ---------------------------- */}
              <section className="card-pad space-y-4">
                <div className="flex items-center gap-2.5">
                  <Wrench size={17} className="text-navy-700" />
                  <h2 className="font-bold tracking-tight text-navy-900">What you do</h2>
                </div>
                <p className="muted text-sm">
                  You are only offered jobs in the trades you pick here.
                </p>

                <div className="flex flex-wrap gap-2">
                  {trades.map((t) => {
                    const on = form.skillTags.includes(t.skillTag);
                    return (
                      <button
                        key={t.skillTag} type="button"
                        onClick={() => toggleIn('skillTags', t.skillTag)}
                        aria-pressed={on}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                          on
                            ? 'border-coop-600 bg-coop-50 text-coop-800'
                            : 'border-navy-200 text-navy-600 hover:border-navy-300'
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ---------------------------- languages --------------------------- */}
              <section className="card-pad space-y-4">
                <div className="flex items-center gap-2.5">
                  <Languages size={17} className="text-navy-700" />
                  <h2 className="font-bold tracking-tight text-navy-900">Languages you speak</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {LANGS.map((l) => {
                    const on = form.languages.includes(l.code);
                    return (
                      <button
                        key={l.code} type="button"
                        onClick={() => toggleIn('languages', l.code)}
                        aria-pressed={on}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                          on
                            ? 'border-coop-600 bg-coop-50 text-coop-800'
                            : 'border-navy-200 text-navy-600 hover:border-navy-300'
                        }`}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ------------------------------ hours ----------------------------- */}
              <section className="card-pad space-y-4">
                <div className="flex items-center gap-2.5">
                  <Clock size={17} className="text-navy-700" />
                  <h2 className="font-bold tracking-tight text-navy-900">When you work</h2>
                </div>
                <p className="muted text-sm">
                  Jobs booked for later are only offered to you inside these hours. Work happening
                  right now still reaches you whenever you are online.
                </p>

                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const on = form.workingDays.includes(d.n);
                    return (
                      <button
                        key={d.n} type="button"
                        onClick={() => toggleIn('workingDays', d.n)}
                        aria-pressed={on}
                        className={`w-14 rounded-lg border py-1.5 text-sm font-medium transition ${
                          on
                            ? 'border-coop-600 bg-coop-50 text-coop-800'
                            : 'border-navy-200 text-navy-600 hover:border-navy-300'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="from" className="label">From</label>
                    <input id="from" type="time" value={form.shiftStart} onChange={set('shiftStart')} className="input mt-1.5" />
                  </div>
                  <div>
                    <label htmlFor="to" className="label">Until</label>
                    <input id="to" type="time" value={form.shiftEnd} onChange={set('shiftEnd')} className="input mt-1.5" />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 rounded-lg border border-navy-200 p-3.5 text-sm text-navy-700">
                  <input
                    type="checkbox" checked={form.acceptsEmergency}
                    onChange={set('acceptsEmergency')} className="mt-0.5 h-4 w-4 rounded border-navy-300"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-navy-900">
                      <Zap size={13} className="text-saffron-600" /> Take emergency jobs
                    </span>
                    Dispatched immediately over a wider radius, outside your usual hours, at a
                    higher rate.
                  </span>
                </label>
              </section>

              {problem && (
                <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {problem}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                {busy ? <Spinner size={16} /> : <Save size={16} />} Save profile
              </button>
            </form>

            {/* Work area is its own save, because it is the one thing that decides
                whether anybody can find you at all. */}
            <WorkArea profile={profile} onSaved={() => reload({ silent: true })} />
          </>
        )}
      </Async>
    </div>
  );
}
