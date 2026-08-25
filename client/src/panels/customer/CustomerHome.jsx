import { Link } from 'react-router-dom';
import {
  PlusCircle, CalendarCheck, Wallet, HandCoins, ArrowRight, Star, MapPin, Zap,
} from 'lucide-react';
import { bookings as bookingApi, services as serviceApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Async, StatCard, SectionHeader, EmptyState, StatusPill, Avatar, Skeleton, RatingStars,
} from '../../components/UI.jsx';
import { inr, formatDateTime, relativeTime } from '../../lib/format.js';
import { serviceIcon, tone } from '../../lib/icons.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import LiveBookingStrip from './LiveBookingStrip.jsx';

export default function CustomerHome() {
  const { user } = useAuth();

  // Polled, because a live booking's status changes without the user acting.
  const { data, loading, error, reload } = useApi(() => bookingApi.dashboard(), [], {
    pollMs: 12_000,
  });

  const { data: services } = useApi(() => serviceApi.list({ limit: 6 }), []);

  return (
    <div className="space-y-8">
      {/* ---------------------------- live jobs --------------------------- */}
      {data?.live?.length > 0 && (
        <section>
          <SectionHeader title="Happening now" hint="Tap to follow the job as it progresses." />
          <div className="space-y-3">
            {data.live.map((b) => (
              <LiveBookingStrip key={b._id} booking={b} />
            ))}
          </div>
        </section>
      )}

      {/* ----------------------------- stats ------------------------------ */}
      <section>
        <SectionHeader
          title={`Hello, ${user?.name?.split(' ')[0]}`}
          hint="Everything you have booked so far."
          action={
            <Link to="/app/book" className="btn-primary">
              <PlusCircle size={16} /> Book a service
            </Link>
          }
        />

        <Async
          loading={loading}
          error={error}
          data={data}
          onRetry={reload}
          skeleton={
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={CalendarCheck}
              label="Jobs booked"
              value={data?.stats?.jobs ?? 0}
              tone="navy"
            />
            <StatCard
              icon={Wallet}
              label="Total spent"
              value={inr(data?.stats?.spent)}
              tone="navy"
            />
            <StatCard
              icon={HandCoins}
              label="Reached the workers"
              value={inr(data?.stats?.toWorkers)}
              sub={`${data?.stats?.toWorkersPct ?? 0}% of what you paid`}
              tone="coop"
            />
            <StatCard
              icon={Star}
              label="Saved on offers"
              value={inr(data?.stats?.saved)}
              tone="saffron"
            />
          </div>
        </Async>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* --------------------------- upcoming --------------------------- */}
        <section className="lg:col-span-2">
          <SectionHeader
            title="Recent bookings"
            action={
              <Link to="/app/bookings" className="btn-ghost btn-sm">
                See all <ArrowRight size={13} />
              </Link>
            }
          />

          {data?.past?.length || data?.upcoming?.length ? (
            <div className="space-y-3">
              {[...(data.upcoming ?? []), ...(data.past ?? [])].slice(0, 6).map((b) => (
                <BookingRow key={b._id} booking={b} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarCheck}
              title="No bookings yet"
              hint="Book your first service and it will show up here."
              action={
                <Link to="/app/book" className="btn-primary">
                  Book a service
                </Link>
              }
            />
          )}
        </section>

        {/* ---------------------------- shortcuts -------------------------- */}
        <aside className="space-y-4">
          <div className="card-pad">
            <h3 className="text-sm font-bold text-navy-900">Book again</h3>
            <p className="muted mt-0.5 mb-4">Popular services in your area.</p>

            <div className="space-y-2">
              {(services ?? []).slice(0, 5).map((s) => {
                const Icon = serviceIcon(s.icon);
                const t = tone(s.heroColor);
                return (
                  <Link
                    key={s._id}
                    to={`/app/book?serviceId=${s._id}`}
                    className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-navy-50"
                  >
                    <span className={`rounded-lg p-2 ${t.bg} ${t.text}`}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy-900">
                        {s.name}
                      </span>
                      <span className="tnum block text-xs text-navy-500">
                        from {inr(s.basePrice)}
                      </span>
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-navy-300" />
                  </Link>
                );
              })}
            </div>
          </div>

          <Link
            to="/app/nearby"
            className="card-pad flex items-center gap-3 transition hover:shadow-lift"
          >
            <span className="rounded-lg bg-saffron-100 p-2.5 text-saffron-700">
              <MapPin size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-navy-900">Who is nearby right now</span>
              <span className="block text-xs text-navy-500">
                Live map of available professionals around you
              </span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-navy-300" />
          </Link>

          <Link
            to="/app/book?emergency=1"
            className="card-pad flex items-center gap-3 border-saffron-200 bg-saffron-50 transition hover:shadow-lift"
          >
            <span className="rounded-lg bg-saffron-500 p-2.5 text-white">
              <Zap size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-saffron-900">Emergency booking</span>
              <span className="block text-xs text-saffron-700">
                Widest search radius, fastest dispatch
              </span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-saffron-400" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function BookingRow({ booking }) {
  const Icon = serviceIcon(booking.service?.icon);

  return (
    <Link
      to={`/app/booking/${booking._id}`}
      className="card flex items-center gap-4 p-4 transition hover:shadow-lift"
    >
      <span className="shrink-0 rounded-lg bg-navy-100 p-2.5 text-navy-600">
        <Icon size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-navy-900">{booking.serviceName}</p>
          <StatusPill status={booking.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-navy-500">
          {booking.worker?.displayName ? `${booking.worker.displayName} · ` : ''}
          {formatDateTime(booking.scheduledFor)}
        </p>
      </div>

      {booking.worker && (
        <Avatar name={booking.worker.displayName} src={booking.worker.photo} size={32} />
      )}

      <div className="shrink-0 text-right">
        <p className="tnum font-bold text-navy-900">{inr(booking.pricing?.total)}</p>
        {booking.review?.rating ? (
          <div className="mt-0.5">
            <RatingStars value={booking.review.rating} size={11} showValue={false} />
          </div>
        ) : (
          <p className="text-xs text-navy-400">{relativeTime(booking.scheduledFor)}</p>
        )}
      </div>
    </Link>
  );
}
