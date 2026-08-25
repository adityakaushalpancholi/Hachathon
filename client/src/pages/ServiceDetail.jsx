import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, X, Clock, Zap, ArrowRight, ClipboardList, Briefcase } from 'lucide-react';
import { services as serviceApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { Async, RatingStars, SectionHeader, Avatar, VerificationBadge } from '../components/UI.jsx';
import { serviceIcon, tone } from '../lib/icons.jsx';
import { inr, mins } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  const { data: service, loading, error, reload } = useApi(() => serviceApi.get(id), [id]);

  const book = (pkg, workerId) => {
    if (!isAuthenticated) return navigate('/login', { state: { from: '/app/book' } });
    if (role !== 'customer') return navigate('/login');

    const params = new URLSearchParams({ serviceId: id });
    if (pkg) params.set('package', pkg.name);
    if (workerId) params.set('worker', workerId);
    navigate(`/app/book?${params}`);
  };

  return (
    <Async loading={loading} error={error} data={service} onRetry={reload}>
      {service && (
        <>
          <ServiceHero service={service} onEmergency={() => book(null, null)} />

          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-3">
              {/* --------------------------- packages -------------------------- */}
              <div className="lg:col-span-2">
                <SectionHeader
                  title="Choose a package"
                  hint="Fixed scope and fixed price. What is included is listed before you book."
                />

                <div className="space-y-3">
                  {service.packages.map((pkg) => (
                    <PackageCard key={pkg._id ?? pkg.name} pkg={pkg} onBook={() => book(pkg)} />
                  ))}
                </div>

                {/* ------------------------- checklist ------------------------- */}
                {service.checklist?.length > 0 && (
                  <div className="mt-10">
                    <SectionHeader
                      title="What the professional will do"
                      hint="The same checklist appears on their screen during the job."
                    />
                    <ol className="card divide-y divide-navy-50">
                      {service.checklist.map((step, i) => (
                        <li key={step} className="flex gap-3 p-4">
                          <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-700">
                            {i + 1}
                          </span>
                          <p className="text-sm leading-relaxed text-navy-700">{step}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* ---------------------------- aside ---------------------------- */}
              <aside className="space-y-6">
                {service.equipment?.length > 0 && (
                  <div className="card-pad">
                    <div className="mb-3 flex items-center gap-2">
                      <ClipboardList size={16} className="text-navy-500" />
                      <h3 className="text-sm font-bold text-navy-900">They bring</h3>
                    </div>
                    <ul className="space-y-2">
                      {service.equipment.map((e) => (
                        <li key={e} className="flex items-center gap-2 text-sm text-navy-600">
                          <Check size={14} className="shrink-0 text-coop-600" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {service.topWorkers?.length > 0 && (
                  <div className="card-pad">
                    <h3 className="mb-1 text-sm font-bold text-navy-900">Top pros for this</h3>
                    <p className="mb-4 text-xs text-navy-500">
                      Book one directly, or let the system offer the job to whoever is closest.
                    </p>

                    <div className="space-y-3">
                      {service.topWorkers.slice(0, 4).map((w) => (
                        <div key={w._id} className="flex items-center gap-3">
                          <Avatar name={w.displayName} src={w.photo} size={38} />
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/worker/${w._id}`}
                              className="block truncate text-sm font-semibold text-navy-900 hover:text-coop-700"
                            >
                              {w.displayName}
                            </Link>
                            <RatingStars
                              value={w.rating?.average ?? 0}
                              count={w.rating?.count}
                              size={11}
                            />
                          </div>
                          <button
                            onClick={() => book(service.packages[0], w._id)}
                            className="btn-outline btn-sm shrink-0"
                          >
                            Book
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card-pad bg-coop-50">
                  <h3 className="text-sm font-bold text-coop-900">Where your money goes</h3>
                  <p className="mt-2 text-sm leading-relaxed text-coop-800">
                    About <strong>90%</strong> of what you pay reaches the professional directly. The
                    company retains 8% and the platform 2%. The split is shown on every booking.
                  </p>
                  <p className="mt-3 text-xs text-coop-700">
                    You will see the exact split for your booking before you confirm it.
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </>
      )}
    </Async>
  );
}

/* -------------------------------------------------------------------------- */

function ServiceHero({ service, onEmergency }) {
  const Icon = serviceIcon(service.icon);
  const t = tone(service.heroColor);

  return (
    <section className="border-b border-navy-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className={`rounded-2xl p-4 ${t.bg} ${t.text}`}>
            <Icon size={30} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-navy">{service.category}</span>
              {service.emergencyAvailable && (
                <span className="badge-saffron">
                  <Zap size={11} /> Emergency available
                </span>
              )}
            </div>

            <h1 className="mt-2.5 text-3xl font-bold tracking-tight text-navy-900">
              {service.name}
            </h1>
            <p className="mt-2 max-w-2xl leading-relaxed text-navy-600">{service.description}</p>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {service.stats?.avgRating > 0 && (
                <RatingStars value={service.stats.avgRating} size={15} />
              )}
              <span className="inline-flex items-center gap-1.5 text-navy-600">
                <Briefcase size={14} className="text-navy-400" />
                <strong className="tnum">{service.stats?.bookings ?? 0}</strong> booked
              </span>
              <span className="inline-flex items-center gap-1.5 text-navy-600">
                <Clock size={14} className="text-navy-400" />
                About {mins(service.baseDurationMins)}
              </span>
            </div>
          </div>

          {service.emergencyAvailable && (
            <button onClick={onEmergency} className="btn-saffron shrink-0">
              <Zap size={16} /> Book emergency
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function PackageCard({ pkg, onBook }) {
  return (
    <article
      className={`card p-5 transition hover:shadow-lift ${
        pkg.popular ? 'ring-2 ring-coop-500' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold tracking-tight text-navy-900">{pkg.name}</h3>
            {pkg.popular && <span className="badge-coop">Most booked</span>}
          </div>
          <p className="mt-1 text-sm text-navy-600">{pkg.description}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-navy-500">
            <Clock size={12} /> {mins(pkg.durationMins)}
          </p>
        </div>

        <div className="text-right">
          <p className="tnum text-2xl font-bold text-navy-900">{inr(pkg.price)}</p>
          <button onClick={onBook} className="btn-primary btn-sm mt-2">
            Book <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {(pkg.includes?.length > 0 || pkg.excludes?.length > 0) && (
        <div className="mt-4 grid gap-x-6 gap-y-1.5 border-t border-navy-100 pt-3.5 sm:grid-cols-2">
          {pkg.includes?.map((inc) => (
            <p key={inc} className="flex items-start gap-2 text-sm text-navy-600">
              <Check size={14} className="mt-0.5 shrink-0 text-coop-600" />
              {inc}
            </p>
          ))}
          {pkg.excludes?.map((exc) => (
            <p key={exc} className="flex items-start gap-2 text-sm text-navy-400">
              <X size={14} className="mt-0.5 shrink-0" />
              {exc}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
