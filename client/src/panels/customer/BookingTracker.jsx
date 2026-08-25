import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Phone, ShieldAlert, XCircle, RefreshCw, KeyRound, Check, MapPin,
  Radio, Star, ChevronLeft, Copy,
} from 'lucide-react';
import { bookings as bookingApi, reviews as reviewApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Async, Avatar, RatingStars, StatusPill, Modal, Spinner, SectionHeader,
} from '../../components/UI.jsx';
import { inr, formatDateTime, formatTime, relativeTime, km } from '../../lib/format.js';
import { TRACK_STEPS, STATUS_META, isLive, CANCEL_REASONS, REVIEW_TAG_LABELS } from '../../lib/status.js';
import { useToast } from '../../context/ToastContext.jsx';
import PriceBreakdown from './PriceBreakdown.jsx';
import PayButton from '../../components/PayButton.jsx';

export default function BookingTracker() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: booking, loading, error, reload } = useApi(() => bookingApi.get(id), [id]);

  // Poll only while something can actually change.
  const live = booking && isLive(booking.status);
  useApi(() => bookingApi.get(id).then((b) => b), [id], {
    pollMs: live ? 8000 : undefined,
    enabled: Boolean(live),
  });

  const act = async (fn, successMsg) => {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      await reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyOtp = (code) => {
    navigator.clipboard?.writeText(code);
    toast.info('Code copied');
  };

  return (
    <Async loading={loading} error={error} data={booking} onRetry={reload}>
      {booking && (
        <div className="mx-auto max-w-3xl space-y-6">
          <button onClick={() => navigate(-1)} className="btn-ghost btn-sm -ml-2">
            <ChevronLeft size={15} /> Back
          </button>

          {/* ----------------------------- header ---------------------------- */}
          <div className="card-pad">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-navy-900">
                    {booking.serviceName}
                  </h1>
                  <StatusPill status={booking.status} />
                </div>
                <p className="muted mt-1">
                  {booking.packageName} · <span className="font-mono">{booking.code}</span>
                </p>
              </div>

              <div className="text-right">
                <p className="tnum text-2xl font-bold text-navy-900">{inr(booking.pricing.total)}</p>
                <p className="text-xs text-navy-500">
                  {booking.payment.status === 'paid'
                    ? `Paid · ${booking.payment.method}`
                    : booking.status === 'completed'
                      ? 'Payment due'
                      : 'Pay now or on completion'}
                </p>
              </div>
            </div>

            <Stepper status={booking.status} timeline={booking.timeline} />
          </div>

          {/* -------------------------- matching state ------------------------ */}
          {['pending', 'dispatching'].includes(booking.status) && (
            <MatchingCard booking={booking} onRetry={() => act(() => bookingApi.retry(id), 'Searching again')} busy={busy} />
          )}

          {/* -------------------------- the professional ---------------------- */}
          {booking.worker && (
            <div className="card-pad">
              <SectionHeader title="Your member" />

              <div className="flex flex-wrap items-center gap-4">
                <Avatar name={booking.worker.displayName} src={booking.worker.photo} size={56} />

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/worker/${booking.worker._id}`}
                    className="font-bold tracking-tight text-navy-900 hover:text-coop-700"
                  >
                    {booking.worker.displayName}
                  </Link>
                  <div className="mt-0.5">
                    <RatingStars
                      value={booking.worker.rating?.average ?? 0}
                      count={booking.worker.rating?.count}
                      size={13}
                    />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-navy-500">
                    {booking.worker.cooperative?.name}
                  </p>
                </div>

                <a href={`tel:${booking.worker.phone ?? ''}`} className="btn-outline btn-sm shrink-0">
                  <Phone size={13} /> Call
                </a>
              </div>
            </div>
          )}

          {/* ------------------------------- OTP ------------------------------ */}
          {booking.otp?.start && ['accepted', 'enroute', 'arrived'].includes(booking.status) && (
            <OtpCard
              title="Start code"
              hint="Read this out when they arrive. Work cannot begin without it."
              code={booking.otp.start}
              onCopy={copyOtp}
            />
          )}

          {booking.otp?.complete && booking.status === 'in_progress' && (
            <OtpCard
              title="Completion code"
              hint="Give this once you are satisfied with the work. It releases their payment."
              code={booking.otp.complete}
              tone="coop"
              onCopy={copyOtp}
            />
          )}

          {/* ------------------------------ review ---------------------------- */}
          {booking.status === 'completed' && !booking.review && (
            <div className="card-pad border-coop-200 bg-coop-50">
              <div className="flex flex-wrap items-center gap-4">
                <Star size={22} className="shrink-0 text-coop-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-coop-900">How did it go?</p>
                  <p className="text-sm text-coop-700">
                    Your rating feeds directly into how work is shared out.
                  </p>
                </div>
                <button onClick={() => setReviewOpen(true)} className="btn-coop shrink-0">
                  Rate this job
                </button>
              </div>
            </div>
          )}

          {booking.review && (
            <div className="card-pad">
              <p className="text-sm font-bold text-navy-900">Your review</p>
              <div className="mt-1.5">
                <RatingStars value={booking.review.rating} size={15} />
              </div>
              {booking.review.comment && (
                <p className="mt-2 text-sm text-navy-600">{booking.review.comment}</p>
              )}
            </div>
          )}

          {/* ----------------------------- details ---------------------------- */}
          <div className="card-pad">
            <SectionHeader title="Details" />
            <dl className="space-y-3 text-sm">
              <Row label="Scheduled" value={formatDateTime(booking.scheduledFor)} />
              <Row
                label="Address"
                value={
                  <>
                    {booking.address.line1}
                    <span className="block text-xs text-navy-500">
                      {booking.address.landmark && `${booking.address.landmark}, `}
                      {booking.address.zone}, {booking.address.city}
                    </span>
                  </>
                }
              />
              {booking.notes && <Row label="Your note" value={booking.notes} />}
              {booking.payment.txnId && (
                <Row label="Transaction" value={<span className="font-mono text-xs">{booking.payment.txnId}</span>} />
              )}
            </dl>

            {booking.service?.checklist?.length > 0 && (
              <div className="mt-5 border-t border-navy-100 pt-4">
                <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-navy-500">
                  What they will do
                </p>
                <ul className="space-y-1.5">
                  {booking.service.checklist.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm text-navy-600">
                      <Check size={14} className="mt-0.5 shrink-0 text-coop-600" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ----------------------------- pricing ---------------------------- */}
          <PriceBreakdown
            quote={{
              pricing: booking.pricing,
              package: { name: booking.packageName },
              surge: { multiplier: booking.pricing.surgeMultiplier },
            }}
          />

          {/* Paying up front is optional — cash on completion stays available,
              which is why this disappears entirely rather than blocking. Once
              the job is done and still unpaid, it is the only thing left to do. */}
          {booking.status !== 'cancelled' && (
            <div
              className={
                booking.status === 'completed' && booking.payment.status !== 'paid'
                  ? 'card-pad border-saffron-300 bg-saffron-50'
                  : ''
              }
            >
              {booking.status === 'completed' && booking.payment.status !== 'paid' && (
                <p className="mb-3 text-sm font-semibold text-saffron-900">
                  This job is finished and {inr(booking.pricing.total)} is still outstanding.
                </p>
              )}
              <PayButton booking={booking} onPaid={() => reload({ silent: true })} />
            </div>
          )}

          {/* ----------------------------- actions ---------------------------- */}
          {isLive(booking.status) && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => act(() => bookingApi.sos(id), 'Alert raised — an administrator has been notified')}
                disabled={busy || booking.sos?.raised}
                className="btn-danger"
              >
                <ShieldAlert size={15} /> {booking.sos?.raised ? 'SOS raised' : 'Raise SOS'}
              </button>
              <button onClick={() => setCancelOpen(true)} disabled={busy} className="btn-outline">
                <XCircle size={15} /> Cancel booking
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------- modals ---------------------------- */}
      <CancelModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        booking={booking}
        onConfirm={async (reason) => {
          await act(() => bookingApi.cancel(id, reason), 'Booking cancelled');
          setCancelOpen(false);
        }}
      />

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        worker={booking?.worker}
        onSubmit={async (payload) => {
          await act(() => reviewApi.create({ bookingId: id, ...payload }), 'Thank you for the rating');
          setReviewOpen(false);
        }}
      />
    </Async>
  );
}

/* -------------------------------------------------------------------------- */

const Row = ({ label, value }) => (
  <div className="flex gap-4">
    <dt className="w-28 shrink-0 text-navy-500">{label}</dt>
    <dd className="min-w-0 flex-1 font-medium text-navy-900">{value}</dd>
  </div>
);

function Stepper({ status, timeline }) {
  const current = STATUS_META[status]?.step ?? 0;
  const failed = current < 0;

  if (failed) {
    const last = timeline?.[timeline.length - 1];
    return (
      <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3.5">
        <p className="text-sm font-bold text-red-900">{STATUS_META[status]?.label}</p>
        {last?.note && <p className="mt-0.5 text-sm text-red-700">{last.note}</p>}
      </div>
    );
  }

  return (
    <ol className="mt-6 flex items-start">
      {TRACK_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;

        return (
          <li key={s.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : done || active ? 'bg-coop-500' : 'bg-navy-200'}`} />
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  done
                    ? 'border-coop-500 bg-coop-500 text-white'
                    : active
                      ? 'border-coop-500 bg-white'
                      : 'border-navy-200 bg-white'
                }`}
              >
                {done ? (
                  <Check size={12} />
                ) : (
                  <span className={`h-2 w-2 rounded-full ${active ? 'bg-coop-500' : 'bg-navy-200'}`} />
                )}
              </span>
              <span className={`h-0.5 flex-1 ${i === TRACK_STEPS.length - 1 ? 'bg-transparent' : done ? 'bg-coop-500' : 'bg-navy-200'}`} />
            </div>
            <span
              className={`mt-1.5 text-center text-[10px] font-semibold leading-tight ${
                active ? 'text-coop-700' : done ? 'text-navy-600' : 'text-navy-300'
              }`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Shown while the dispatch engine is still looking. */
function MatchingCard({ booking, onRetry, busy }) {
  const notified = booking.dispatch?.candidates?.length ?? 0;
  const declined = booking.dispatch?.candidates?.filter((c) => c.response === 'declined').length ?? 0;

  /**
   * Three distinct states share the pending/dispatching pair, and conflating
   * them is misleading:
   *
   *   queued    — scheduled for later, not offered to anyone yet
   *   searching — actively out with professionals right now
   *   failed    — offered, and nobody took it
   */
  const roundsRun = booking.dispatch?.round ?? 0;
  const inFuture = new Date(booking.scheduledFor) - Date.now() > 30 * 60_000;

  const state =
    booking.status === 'dispatching'
      ? 'searching'
      : roundsRun === 0 && inFuture
        ? 'queued'
        : 'failed';

  const COPY = {
    queued: {
      title: 'Scheduled',
      body: `We start offering this about 30 minutes before your slot, so you get someone who is actually free then.`,
    },
    searching: {
      title: 'Finding you a member',
      body: `Offered to ${notified} member${notified === 1 ? '' : 's'} within ${booking.dispatch?.radiusKm ?? '—'} km. First to accept takes the job.`,
    },
    failed: {
      title: 'Nobody available right now',
      body: 'We could not match this request. Try again, or pick a different time slot.',
    },
  }[state];

  return (
    <div className="card-pad">
      <div className="flex items-start gap-3.5">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          {state === 'searching' && (
            <span className="absolute inline-flex h-8 w-8 animate-pulse-ring rounded-full bg-saffron-400" />
          )}
          <span
            className={`relative inline-flex rounded-full p-2 text-white ${
              state === 'queued' ? 'bg-navy-500' : 'bg-saffron-500'
            }`}
          >
            <Radio size={16} />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy-900">{COPY.title}</p>
          <p className="mt-0.5 text-sm text-navy-600">{COPY.body}</p>

          {declined > 0 && state === 'searching' && (
            <p className="mt-1 text-xs text-navy-400">
              {declined} passed — we widen the search automatically.
            </p>
          )}

          {state !== 'searching' && (
            <button onClick={onRetry} disabled={busy} className="btn-primary btn-sm mt-3">
              {busy ? <Spinner size={13} /> : <RefreshCw size={13} />}
              {state === 'queued' ? 'Find someone now' : 'Search again'}
            </button>
          )}
        </div>
      </div>

      {/* Candidate list — makes the auction legible rather than a black box. */}
      {notified > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-navy-100 pt-3.5">
          {booking.dispatch.candidates.slice(0, 5).map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  c.response === 'accepted'
                    ? 'bg-coop-500'
                    : c.response === 'pending'
                      ? 'bg-saffron-400'
                      : 'bg-navy-200'
                }`}
              />
              <span className="flex-1 text-navy-600">
                {km(c.distanceKm)} away · ETA {c.etaMins} min
              </span>
              <span
                className={`font-semibold ${
                  c.response === 'accepted'
                    ? 'text-coop-700'
                    : c.response === 'pending'
                      ? 'text-saffron-700'
                      : 'text-navy-400'
                }`}
              >
                {c.response === 'pending' ? 'deciding' : c.response}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OtpCard({ title, hint, code, tone = 'navy', onCopy }) {
  const cls =
    tone === 'coop'
      ? 'border-coop-200 bg-coop-50 text-coop-900'
      : 'border-navy-200 bg-navy-900 text-white';

  return (
    <div className={`card-pad ${cls}`}>
      <div className="flex flex-wrap items-center gap-4">
        <KeyRound size={22} className="shrink-0 opacity-70" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{title}</p>
          <p className={`mt-0.5 text-xs ${tone === 'coop' ? 'text-coop-700' : 'text-navy-300'}`}>
            {hint}
          </p>
        </div>
        <button
          onClick={() => onCopy(code)}
          className="tnum flex shrink-0 items-center gap-2 rounded-lg bg-white/15 px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em] transition hover:bg-white/25"
        >
          {code}
          <Copy size={14} className="opacity-60" />
        </button>
      </div>
    </div>
  );
}

function CancelModal({ open, onClose, booking, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // The fee ladder mirrors server/src/services/pricing.service.js.
  const fee =
    booking &&
    (['pending', 'dispatching'].includes(booking.status)
      ? 0
      : booking.status === 'accepted'
        ? Math.round(booking.pricing.total * 0.05)
        : Math.round(booking.pricing.total * 0.15));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this booking?"
      footer={
        <>
          <button onClick={onClose} className="btn-outline">
            Keep it
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              await onConfirm(reason);
              setBusy(false);
            }}
            disabled={!reason || busy}
            className="btn-danger"
          >
            {busy ? <Spinner size={14} /> : <XCircle size={14} />} Cancel booking
          </button>
        </>
      }
    >
      {fee > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          A member has already committed to this job. A cancellation fee of{' '}
          <strong>{inr(fee)}</strong> applies, which goes to them for the travel already made.
        </div>
      )}

      <p className="label">Why are you cancelling?</p>
      <div className="space-y-2">
        {CANCEL_REASONS.map((r) => (
          <label
            key={r}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition ${
              reason === r ? 'border-navy-900 bg-navy-50' : 'border-navy-100 hover:border-navy-300'
            }`}
          >
            <input
              type="radio"
              name="reason"
              checked={reason === r}
              onChange={() => setReason(r)}
              className="h-4 w-4 accent-navy-900"
            />
            <span className="text-sm text-navy-800">{r}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function ReviewModal({ open, onClose, worker, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (t) => setTags((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Rate ${worker?.displayName ?? 'this member'}`}
      footer={
        <>
          <button onClick={onClose} className="btn-outline">
            Later
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              await onSubmit({ rating, tags, comment: comment || undefined });
              setBusy(false);
            }}
            disabled={busy}
            className="btn-coop"
          >
            {busy ? <Spinner size={14} /> : <Star size={14} />} Submit rating
          </button>
        </>
      }
    >
      <div className="flex justify-center gap-2 py-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
            <Star
              size={34}
              className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-navy-200'}
            />
          </button>
        ))}
      </div>

      <p className="label mt-4">What went well?</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(REVIEW_TAG_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`badge border transition ${
              tags.includes(key)
                ? 'border-coop-600 bg-coop-600 text-white'
                : 'border-navy-200 bg-white text-navy-600 hover:border-coop-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label htmlFor="comment" className="label mt-4">
        Anything else? <span className="font-normal normal-case">(optional)</span>
      </label>
      <textarea
        id="comment"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="input resize-none"
        maxLength={1000}
        placeholder="What stood out about the work?"
      />
    </Modal>
  );
}
