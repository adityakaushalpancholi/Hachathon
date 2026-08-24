import { Link } from 'react-router-dom';
import {
  Power, Wallet, Briefcase, Star, Clock, Target, Zap, ArrowRight, ShieldAlert, Inbox,
  MessageSquare, Send,
} from 'lucide-react';
import { workerPanel } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Async, StatCard, SectionHeader, EmptyState, StatusPill, Progress, Spinner, Skeleton,
} from '../../components/UI.jsx';
import { inr, pct, formatDateTime, relativeTime } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useState } from 'react';
import OfferCard from './OfferCard.jsx';
import ActiveJobCard from './ActiveJobCard.jsx';

function ReviewCard({ review, onReplied }) {
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await workerPanel.respondToReview(review._id, text.trim());
      toast.success('Reply posted');
      setReplying(false);
      setText('');
      onReplied?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-navy-900">
              {review.customer?.name ?? 'Customer'}
            </span>
            <span className="flex items-center gap-0.5 text-xs text-saffron-600">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={11} fill={i < review.rating ? 'currentColor' : 'none'} />
              ))}
            </span>
            <span className="text-xs text-navy-400">{relativeTime(review.createdAt)}</span>
          </div>
          {review.text && (
            <p className="mt-1 text-sm leading-relaxed text-navy-700">{review.text}</p>
          )}

          {review.response?.text ? (
            <div className="mt-2.5 rounded-lg border border-coop-100 bg-coop-50 p-3">
              <p className="text-xs font-semibold text-coop-700">Your reply</p>
              <p className="mt-0.5 text-sm text-coop-900">{review.response.text}</p>
            </div>
          ) : replying ? (
            <div className="mt-2.5 flex gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write your reply…"
                maxLength={500}
                className="input flex-1 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                disabled={submitting}
                autoFocus
              />
              <button onClick={submit} disabled={submitting || !text.trim()} className="btn-coop btn-sm">
                {submitting ? <Spinner size={13} /> : <Send size={13} />}
                Reply
              </button>
              <button onClick={() => { setReplying(false); setText(''); }} className="btn-ghost btn-sm" disabled={submitting}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setReplying(true)} className="btn-ghost btn-sm mt-2">
              <MessageSquare size={13} /> Reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkerHome() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [toggling, setToggling] = useState(false);

  // Offers expire on a timer, so this panel polls faster than the others.
  const { data, loading, error, reload } = useApi(() => workerPanel.dashboard(), [], {
    pollMs: 8000,
  });

  const profile = data?.profile;
  const verified = profile?.verification?.status === 'verified';
  const online = profile?.availability?.isOnline;

  const toggleOnline = async () => {
    setToggling(true);
    try {
      await workerPanel.setAvailability({ isOnline: !online });
      toast.success(!online ? 'You are online — job offers will come through' : 'You are offline');
      await reload({ silent: true });
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setToggling(false);
    }
  };

  return (
    <Async
      loading={loading}
      error={error}
      data={data}
      onRetry={reload}
      skeleton={
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      {data && (
        <div className="space-y-8">
          {/* ------------------------ verification gate ------------------------ */}
          {!verified && (
            <div className="card-pad border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3.5">
                <ShieldAlert size={22} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold text-amber-900">
                    {profile?.verification?.status === 'suspended'
                      ? 'Your membership is suspended'
                      : 'Waiting on verification'}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-800">
                    {profile?.verification?.note ||
                      'Your cooperative’s board is reviewing your documents. You can go online and take jobs once they approve you — members verify members here, so a person is reading your file.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------- online switch ----------------------- */}
          <div
            className={`card-pad transition ${
              online ? 'border-coop-300 bg-coop-50' : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-4">
              <span
                className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                  online ? 'bg-coop-600 text-white' : 'bg-navy-200 text-navy-500'
                }`}
              >
                {online && (
                  <span className="absolute inline-flex h-10 w-10 animate-pulse-ring rounded-full bg-coop-400" />
                )}
                <Power size={20} className="relative" />
              </span>

              <div className="min-w-0 flex-1">
                <p className={`font-bold ${online ? 'text-coop-900' : 'text-navy-900'}`}>
                  {online ? 'You are online' : 'You are offline'}
                </p>
                <p className={`text-sm ${online ? 'text-coop-700' : 'text-navy-500'}`}>
                  {online
                    ? `Taking offers within ${profile.serviceRadiusKm} km of ${profile.baseArea}`
                    : 'Go online to start receiving job offers.'}
                </p>
              </div>

              <button
                onClick={toggleOnline}
                disabled={!verified || toggling}
                className={online ? 'btn-outline' : 'btn-coop'}
              >
                {toggling ? <Spinner size={15} /> : <Power size={15} />}
                {online ? 'Go offline' : 'Go online'}
              </button>
            </div>
          </div>

          {/* --------------------------- today's target ----------------------- */}
          <section>
            <SectionHeader
              title="Today"
              hint="Your daily target and what you have earned so far."
            />

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="card-pad lg:col-span-1">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold text-navy-900">
                    <Target size={15} className="text-saffron-600" /> Daily target
                  </span>
                  <span className="tnum text-sm font-bold text-navy-900">
                    {data.earnings.today.jobs}/{data.earnings.today.target}
                  </span>
                </div>

                <Progress
                  value={data.earnings.today.progress}
                  tone={data.earnings.today.bonusUnlocked ? 'coop' : 'saffron'}
                />

                <p className="mt-2.5 text-xs leading-relaxed text-navy-600">
                  {data.earnings.today.bonusUnlocked ? (
                    <span className="font-semibold text-coop-700">
                      Target hit — {inr(data.earnings.today.bonusAmount)} bonus unlocked.
                    </span>
                  ) : (
                    `Complete ${data.earnings.today.target - data.earnings.today.jobs} more to unlock a ${inr(data.earnings.today.bonusAmount)} bonus.`
                  )}
                </p>

                <p className="tnum mt-3 border-t border-navy-100 pt-3 text-2xl font-bold text-navy-900">
                  {inr(data.earnings.today.earned)}
                  <span className="ml-1.5 text-sm font-medium text-navy-400">earned today</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:col-span-2">
                <StatCard
                  icon={Wallet}
                  label="This month"
                  value={inr(data.earnings.thisMonth)}
                  sub={`${data.earnings.jobsThisMonth} jobs`}
                  tone="coop"
                />
                <StatCard
                  icon={Briefcase}
                  label="Awaiting payout"
                  value={inr(data.earnings.pendingPayout)}
                  sub="Settles this cycle"
                  tone="navy"
                />
                <StatCard
                  icon={Star}
                  label="Rating"
                  value={profile.rating?.average ? profile.rating.average.toFixed(1) : '—'}
                  sub={`${profile.rating?.count ?? 0} reviews`}
                  tone="saffron"
                />
                <StatCard
                  icon={Clock}
                  label="On time"
                  value={pct(profile.onTimeRate)}
                  sub={`Accepts ${pct(profile.acceptanceRate)} of offers`}
                  tone="navy"
                />
              </div>
            </div>
          </section>

          {/* ----------------------------- active job ------------------------- */}
          {data.activeJob && (
            <section>
              <SectionHeader title="Your current job" />
              <ActiveJobCard job={data.activeJob} onChanged={() => reload({ silent: true })} />
            </section>
          )}

          {/* ------------------------------ offers ---------------------------- */}
          <section>
            <SectionHeader
              title={`Job offers${data.offers.length ? ` (${data.offers.length})` : ''}`}
              hint="First to accept takes the job."
              action={
                data.offers.length > 0 && (
                  <Link to="/work/inbox" className="btn-ghost btn-sm">
                    See all <ArrowRight size={13} />
                  </Link>
                )
              }
            />

            {data.offers.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={online ? 'No offers right now' : 'You are offline'}
                hint={
                  online
                    ? 'Offers appear here the moment a customer nearby books your trade.'
                    : 'Go online to start receiving job offers.'
                }
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.offers.slice(0, 4).map((o) => (
                  <OfferCard key={o._id} offer={o} onChanged={() => reload({ silent: true })} />
                ))}
              </div>
            )}
          </section>

          {/* ---------------------------- upcoming ---------------------------- */}
          {data.upcoming?.length > 0 && (
            <section>
              <SectionHeader title="Scheduled next" />
              <div className="space-y-2.5">
                {data.upcoming.map((j) => (
                  <Link
                    key={j._id}
                    to={`/work/job/${j._id}`}
                    className="card flex items-center gap-4 p-4 transition hover:shadow-lift"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-navy-900">{j.serviceName}</p>
                        <StatusPill status={j.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-navy-500">
                        {j.customer?.name} · {formatDateTime(j.scheduledFor)} ·{' '}
                        {j.address?.zone}
                      </p>
                    </div>
                    <p className="tnum shrink-0 font-bold text-coop-700">
                      {inr(j.pricing?.workerPayout)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ----------------------------- recent ----------------------------- */}
          {data.recent?.length > 0 && (
            <section>
              <SectionHeader
                title="Recently completed"
                action={
                  <Link to="/work/earnings" className="btn-ghost btn-sm">
                    Earnings <ArrowRight size={13} />
                  </Link>
                }
              />
              <div className="card divide-y divide-navy-50">
                {data.recent.map((j) => (
                  <div key={j._id} className="flex items-center gap-4 p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-900">
                        {j.serviceName}
                      </p>
                      <p className="truncate text-xs text-navy-500">
                        {j.customer?.name} · {relativeTime(j.otp?.completeVerifiedAt)}
                      </p>
                    </div>
                    <p className="tnum shrink-0 text-sm font-bold text-coop-700">
                      +{inr(j.pricing?.workerPayout)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ----------------------------- reviews ----------------------------- */}
          {data.reviews?.length > 0 && (
            <section>
              <SectionHeader
                title={`Your reviews (${data.reviews.length})`}
                hint="You can reply to any review — your response is visible to customers."
              />
              <div className="card divide-y divide-navy-50">
                {data.reviews.map((r) => (
                  <ReviewCard key={r._id} review={r} onReplied={() => reload({ silent: true })} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Async>
  );
}
