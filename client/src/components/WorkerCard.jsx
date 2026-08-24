import { Link } from 'react-router-dom';
import { MapPin, Clock, Briefcase, Building2 } from 'lucide-react';
import { Avatar, RatingStars, VerificationBadge } from './UI.jsx';
import { inr, km, titleCase } from '../lib/format.js';
import { BADGE_LABELS } from '../lib/status.js';

/**
 * Member summary card. Shows distance and ETA when the record came from a geo
 * search, and falls back to the base area when it did not.
 */
export default function WorkerCard({ worker, action }) {
  const skill = worker.skills?.[0];
  const online = worker.availability?.isOnline && !worker.availability?.activeBooking;

  return (
    <article className="card flex flex-col p-4 transition hover:shadow-lift">
      <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          <Avatar name={worker.displayName} src={worker.photo} size={48} />
          {online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-coop-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/worker/${worker._id}`}
              className="truncate font-bold tracking-tight text-navy-900 hover:text-coop-700"
            >
              {worker.displayName}
            </Link>
            <span className="tnum shrink-0 text-sm font-bold text-navy-900">
              {inr(worker.hourlyRate)}
              <span className="text-xs font-medium text-navy-400">/hr</span>
            </span>
          </div>

          <p className="mt-0.5 truncate text-xs font-medium text-navy-500">
            {titleCase(skill?.skillTag)} · {titleCase(skill?.level)}
          </p>

          <div className="mt-1.5">
            <RatingStars value={worker.rating?.average ?? 0} count={worker.rating?.count} size={13} />
          </div>
        </div>
      </div>

      {/* --------------------------- attributes --------------------------- */}
      <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-navy-100 pt-3 text-xs">
        <div>
          <dt className="flex items-center gap-1 text-navy-400">
            <Briefcase size={11} /> Jobs
          </dt>
          <dd className="tnum mt-0.5 font-bold text-navy-800">{worker.stats?.jobsCompleted ?? 0}</dd>
        </div>

        <div>
          <dt className="flex items-center gap-1 text-navy-400">
            <MapPin size={11} /> {worker.distanceKm != null ? 'Distance' : 'Area'}
          </dt>
          <dd className="mt-0.5 truncate font-bold text-navy-800">
            {worker.distanceKm != null ? km(worker.distanceKm) : (worker.baseArea ?? '—')}
          </dd>
        </div>

        <div>
          <dt className="flex items-center gap-1 text-navy-400">
            <Clock size={11} /> {worker.etaMins != null ? 'ETA' : 'On time'}
          </dt>
          <dd className="tnum mt-0.5 font-bold text-navy-800">
            {worker.etaMins != null ? `${worker.etaMins} min` : `${worker.onTimeRate ?? 0}%`}
          </dd>
        </div>
      </dl>

      {/* ----------------------------- badges ----------------------------- */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <VerificationBadge status={worker.verification?.status} />
        {worker.badges?.slice(0, 2).map((b) => (
          <span key={b} className="badge-navy">
            {BADGE_LABELS[b] ?? titleCase(b)}
          </span>
        ))}
      </div>

      {worker.cooperative?.name && (
        <p className="mt-2.5 flex items-center gap-1.5 truncate text-[11px] text-navy-400">
          <Building2 size={11} className="shrink-0" />
          {worker.cooperative.name}
        </p>
      )}

      {action && <div className="mt-3.5 border-t border-navy-100 pt-3.5">{action}</div>}
    </article>
  );
}
