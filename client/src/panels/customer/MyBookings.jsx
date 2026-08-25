import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, PlusCircle } from 'lucide-react';
import { bookings as bookingApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Async, SectionHeader, EmptyState, StatusPill, Avatar, RatingStars, Skeleton,
} from '../../components/UI.jsx';
import { inr, formatDateTime } from '../../lib/format.js';
import { serviceIcon } from '../../lib/icons.jsx';

const FILTERS = [
  { value: null, label: 'All' },
  { value: 'live', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function MyBookings() {
  const [filter, setFilter] = useState(null);

  const params =
    filter === 'live' ? { live: true } : filter ? { status: filter } : {};

  const { data, loading, error, reload } = useApi(
    () => bookingApi.list({ ...params, limit: 50 }),
    [filter],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeader
        title="My bookings"
        hint="Every booking you have made, newest first."
        action={
          <Link to="/app/book" className="btn-primary">
            <PlusCircle size={16} /> New booking
          </Link>
        }
      />

      <div className="mb-5 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            className={`badge border transition ${
              filter === f.value
                ? 'border-navy-900 bg-navy-900 text-white'
                : 'border-navy-200 bg-white text-navy-600 hover:border-navy-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Async
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        skeleton={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        }
        empty={
          <EmptyState
            icon={CalendarCheck}
            title="Nothing here"
            hint={
              filter
                ? 'No bookings match this filter.'
                : 'Book a service and it will appear here.'
            }
            action={
              <Link to="/app/book" className="btn-primary">
                Book a service
              </Link>
            }
          />
        }
      >
        <div className="space-y-3">
          {(data ?? []).map((b) => {
            const Icon = serviceIcon(b.service?.icon);

            return (
              <Link
                key={b._id}
                to={`/app/booking/${b._id}`}
                className="card block p-4 transition hover:shadow-lift"
              >
                <div className="flex items-start gap-4">
                  <span className="shrink-0 rounded-lg bg-navy-100 p-2.5 text-navy-600">
                    <Icon size={18} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-navy-900">{b.serviceName}</p>
                      <StatusPill status={b.status} />
                    </div>

                    <p className="mt-0.5 text-sm text-navy-500">{b.packageName}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
                      <span className="font-mono">{b.code}</span>
                      <span>{formatDateTime(b.scheduledFor)}</span>
                      {b.address?.zone && <span>{b.address.zone}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="tnum font-bold text-navy-900">{inr(b.pricing?.total)}</p>
                    <p className="mt-0.5 text-xs text-coop-700">
                      {inr(b.pricing?.workerPayout)} to the pro
                    </p>
                  </div>
                </div>

                {b.worker && (
                  <div className="mt-3 flex items-center gap-2.5 border-t border-navy-100 pt-3">
                    <Avatar name={b.worker.displayName} src={b.worker.photo} size={26} />
                    <span className="truncate text-sm font-medium text-navy-700">
                      {b.worker.displayName}
                    </span>
                    {b.worker.cooperative?.name && (
                      <span className="hidden truncate text-xs text-navy-400 sm:block">
                        · {b.worker.cooperative.name}
                      </span>
                    )}
                    {b.review?.rating && (
                      <span className="ml-auto shrink-0">
                        <RatingStars value={b.review.rating} size={12} showValue={false} />
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </Async>
    </div>
  );
}
