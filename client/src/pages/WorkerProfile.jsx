import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MapPin, Clock, Briefcase, Building2, Languages, GraduationCap, MessageSquare, ArrowRight,
} from 'lucide-react';
import { workers as workerApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import {
  Async, Avatar, RatingStars, VerificationBadge, StatCard, SectionHeader, EmptyState,
} from '../components/UI.jsx';
import { inr, pct, titleCase, relativeTime } from '../lib/format.js';
import { BADGE_LABELS, REVIEW_TAG_LABELS } from '../lib/status.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function WorkerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  const { data: worker, loading, error, reload } = useApi(() => workerApi.get(id), [id]);

  const book = () => {
    if (!isAuthenticated || role !== 'customer') {
      return navigate('/login', { state: { from: '/app/book' } });
    }
    const skillTag = worker.skills?.[0]?.skillTag;
    const serviceId = worker.skills?.[0]?.service?._id;
    const params = new URLSearchParams({ worker: worker._id });
    if (serviceId) params.set('serviceId', serviceId);
    if (skillTag) params.set('skill', skillTag);
    navigate(`/app/book?${params}`);
  };

  return (
    <Async loading={loading} error={error} data={worker} onRetry={reload}>
      {worker && (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
          {/* ------------------------------ header ----------------------------- */}
          <div className="card-pad">
            <div className="flex flex-wrap items-start gap-5">
              <div className="relative shrink-0">
                <Avatar name={worker.displayName} src={worker.photo} size={80} />
                {worker.isBookable && (
                  <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-coop-500" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight text-navy-900">
                  {worker.displayName}
                </h1>
                <p className="mt-0.5 text-sm font-medium text-navy-500">
                  {titleCase(worker.skills?.[0]?.skillTag)} ·{' '}
                  {titleCase(worker.skills?.[0]?.level)} · {worker.experienceYears} years
                </p>

                <div className="mt-2.5">
                  <RatingStars
                    value={worker.rating?.average ?? 0}
                    count={worker.rating?.count}
                    size={16}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <VerificationBadge status={worker.verification?.status} />
                  {worker.badges?.map((b) => (
                    <span key={b} className="badge-navy">
                      {BADGE_LABELS[b] ?? titleCase(b)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Rate</p>
                <p className="tnum text-2xl font-bold text-navy-900">
                  {inr(worker.hourlyRate)}
                  <span className="text-sm font-medium text-navy-400">/hr</span>
                </p>
                <button onClick={book} className="btn-primary mt-3">
                  Book this member <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {worker.bio && (
              <p className="mt-5 border-t border-navy-100 pt-4 leading-relaxed text-navy-600">
                {worker.bio}
              </p>
            )}
          </div>

          {/* ------------------------------- stats ----------------------------- */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={Briefcase}
              label="Jobs completed"
              value={worker.stats?.jobsCompleted ?? 0}
              tone="navy"
            />
            <StatCard
              icon={Clock}
              label="On time"
              value={pct(worker.onTimeRate)}
              sub="Started within 15 min of the slot"
              tone="coop"
            />
            <StatCard
              icon={MessageSquare}
              label="Accepts offers"
              value={pct(worker.acceptanceRate)}
              sub={`Replies in ~${worker.stats?.responseSeconds ?? 0}s`}
              tone="navy"
            />
            <StatCard
              icon={MapPin}
              label="Works within"
              value={`${worker.serviceRadiusKm} km`}
              sub={worker.baseArea}
              tone="saffron"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* ----------------------------- reviews --------------------------- */}
            <div className="lg:col-span-2">
              <SectionHeader
                title="Reviews"
                hint={
                  worker.rating?.count
                    ? `${worker.rating.count} customers have rated this member`
                    : 'No reviews yet'
                }
              />

              {/* Tag frequencies — the shorthand summary of many reviews. */}
              {worker.rating?.tagCounts && Object.keys(worker.rating.tagCounts).length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {Object.entries(worker.rating.tagCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([tag, count]) => (
                      <span key={tag} className="badge-coop">
                        {REVIEW_TAG_LABELS[tag] ?? titleCase(tag)}
                        <span className="tnum ml-0.5 opacity-70">{count}</span>
                      </span>
                    ))}
                </div>
              )}

              {worker.reviews?.length ? (
                <div className="space-y-3">
                  {worker.reviews.map((r) => (
                    <article key={r._id} className="card-pad">
                      <div className="flex items-start gap-3">
                        <Avatar name={r.customer?.name} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-navy-900">
                              {r.customer?.name ?? 'Customer'}
                            </p>
                            <p className="text-xs text-navy-400">{relativeTime(r.createdAt)}</p>
                          </div>
                          <div className="mt-1">
                            <RatingStars value={r.rating} size={12} showValue={false} />
                          </div>
                          {r.comment && (
                            <p className="mt-2 text-sm leading-relaxed text-navy-600">{r.comment}</p>
                          )}
                          {r.tags?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {r.tags.map((t) => (
                                <span key={t} className="badge-navy">
                                  {REVIEW_TAG_LABELS[t] ?? titleCase(t)}
                                </span>
                              ))}
                            </div>
                          )}
                          {r.response?.text && (
                            <div className="mt-3 rounded-lg border-l-2 border-coop-400 bg-coop-50 p-3">
                              <p className="text-xs font-bold text-coop-800">
                                {worker.displayName} replied
                              </p>
                              <p className="mt-1 text-sm text-coop-900">{r.response.text}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title="No reviews yet"
                  hint="This member has not been rated on ShramSetu yet."
                />
              )}
            </div>

            {/* ------------------------------ aside ---------------------------- */}
            <aside className="space-y-4">
              {worker.cooperative && (
                <div className="card-pad">
                  <div className="mb-2.5 flex items-center gap-2 text-navy-500">
                    <Building2 size={15} />
                    <h3 className="text-xs font-bold uppercase tracking-wide">Company</h3>
                  </div>
                  <p className="font-bold tracking-tight text-navy-900">
                    {worker.cooperative.name}
                  </p>
                  <p className="muted mt-0.5">{worker.cooperative.city}</p>

                  {worker.cooperative.governance && (
                    <dl className="mt-3 space-y-1.5 border-t border-navy-100 pt-3 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-navy-500">Commission</dt>
                        <dd className="tnum font-semibold text-navy-900">
                          {pct(worker.cooperative.governance.commissionPct * 100)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-navy-500">Rate floor</dt>
                        <dd className="tnum font-semibold text-navy-900">
                          {inr(worker.cooperative.governance.minHourlyRate)}/hr
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              )}

              {worker.languages?.length > 0 && (
                <div className="card-pad">
                  <div className="mb-2.5 flex items-center gap-2 text-navy-500">
                    <Languages size={15} />
                    <h3 className="text-xs font-bold uppercase tracking-wide">Speaks</h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {worker.languages.map((l) => (
                      <span key={l} className="badge-navy uppercase">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {worker.trainingCompleted?.length > 0 && (
                <div className="card-pad">
                  <div className="mb-2.5 flex items-center gap-2 text-navy-500">
                    <GraduationCap size={15} />
                    <h3 className="text-xs font-bold uppercase tracking-wide">
                      Training completed
                    </h3>
                  </div>
                  <ul className="space-y-1.5">
                    {worker.trainingCompleted.map((t) => (
                      <li key={t} className="text-sm text-navy-700">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}
    </Async>
  );
}
