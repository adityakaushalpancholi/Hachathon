import { Link } from 'react-router-dom';
import { Radio, ArrowRight, Clock } from 'lucide-react';
import { Avatar, StatusPill } from '../../components/UI.jsx';
import { STATUS_META } from '../../lib/status.js';
import { formatTime } from '../../lib/format.js';

/**
 * Compact live-job banner. The pulsing ring is the only animated element on the
 * page — it earns its place by marking the one thing that is changing on its own.
 */
export default function LiveBookingStrip({ booking }) {
  const step = STATUS_META[booking.status]?.step ?? 0;
  const progress = Math.max(0, Math.min(100, (step / 6) * 100));
  const matching = ['pending', 'dispatching'].includes(booking.status);

  return (
    <Link
      to={`/app/booking/${booking._id}`}
      className="card block overflow-hidden transition hover:shadow-lift"
    >
      <div className="flex items-center gap-4 p-4">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-8 w-8 animate-pulse-ring rounded-full bg-coop-400" />
          <span className="relative inline-flex rounded-full bg-coop-600 p-2 text-white">
            <Radio size={16} />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold text-navy-900">{booking.serviceName}</p>
            <StatusPill status={booking.status} />
          </div>

          <p className="mt-0.5 truncate text-xs text-navy-500">
            {matching
              ? 'Offering the job to nearby professionals…'
              : booking.worker?.displayName
                ? `${booking.worker.displayName} · slot at ${formatTime(booking.scheduledFor)}`
                : formatTime(booking.scheduledFor)}
          </p>
        </div>

        {booking.worker && (
          <Avatar name={booking.worker.displayName} src={booking.worker.photo} size={36} />
        )}

        <ArrowRight size={16} className="shrink-0 text-navy-300" />
      </div>

      <div className="h-1 w-full bg-navy-100">
        <div
          className="h-full bg-coop-500 transition-all duration-700"
          style={{ width: `${matching ? 25 : progress}%` }}
        />
      </div>
    </Link>
  );
}
