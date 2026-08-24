import { useEffect, useState } from 'react';
import { MapPin, Clock, Zap, Check, X, Timer } from 'lucide-react';
import { workerPanel } from '../../api/index.js';
import { Spinner, Modal } from '../../components/UI.jsx';
import { inr, km, formatDateTime, secondsUntil } from '../../lib/format.js';
import { WORKER_DECLINE_REASONS } from '../../lib/status.js';
import { serviceIcon } from '../../lib/icons.jsx';
import { useToast } from '../../context/ToastContext.jsx';

/**
 * A live job offer with its countdown.
 *
 * The timer is what makes the broadcast auction legible to the worker: the same
 * offer is sitting in several inboxes at once, and whoever taps Accept first
 * gets it. When the window closes the server re-broadcasts to a wider radius.
 */
export default function OfferCard({ offer, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [remaining, setRemaining] = useState(() => secondsUntil(offer.dispatch.expiresAt));

  useEffect(() => {
    const id = setInterval(() => setRemaining(secondsUntil(offer.dispatch.expiresAt)), 1000);
    return () => clearInterval(id);
  }, [offer.dispatch.expiresAt]);

  const total = Math.max(1, Math.round((new Date(offer.dispatch.expiresAt) - new Date(offer.dispatch.candidates?.[0]?.notifiedAt ?? Date.now())) / 1000));
  const pctLeft = Math.max(0, Math.min(100, (remaining / total) * 100));
  const urgent = remaining <= 15;
  const expired = remaining <= 0;

  const mine = offer.dispatch.candidates?.find((c) => c.response === 'pending');
  const Icon = serviceIcon(offer.service?.icon);

  const accept = async () => {
    setBusy('accept');
    try {
      await workerPanel.accept(offer._id);
      toast.success(`Job ${offer.code} is yours`);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const decline = async (reason) => {
    setBusy('decline');
    try {
      await workerPanel.decline(offer._id, reason);
      toast.info('Passed — it will go to someone else');
      setDeclineOpen(false);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <article
        className={`card overflow-hidden transition ${
          expired ? 'opacity-50' : urgent ? 'ring-2 ring-red-400' : 'ring-1 ring-saffron-200'
        }`}
      >
        {/* Countdown bar */}
        <div className="h-1 w-full bg-navy-100">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              urgent ? 'bg-red-500' : 'bg-saffron-500'
            }`}
            style={{ width: `${pctLeft}%` }}
          />
        </div>

        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="shrink-0 rounded-lg bg-saffron-100 p-2.5 text-saffron-700">
              <Icon size={18} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-navy-900">{offer.serviceName}</p>
                {offer.type === 'emergency' && (
                  <span className="badge-saffron">
                    <Zap size={11} /> Emergency
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-navy-500">
                {offer.packageName} · <span className="font-mono">{offer.code}</span>
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="tnum text-xl font-bold text-coop-700">
                {inr(offer.pricing?.workerPayout)}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-navy-400">
                you keep
              </p>
            </div>
          </div>

          {/* Facts the worker decides on */}
          <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-navy-100 pt-3 text-xs">
            <div>
              <dt className="flex items-center gap-1 text-navy-400">
                <MapPin size={11} /> Distance
              </dt>
              <dd className="tnum mt-0.5 font-bold text-navy-800">{km(mine?.distanceKm)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-navy-400">
                <Clock size={11} /> Travel
              </dt>
              <dd className="tnum mt-0.5 font-bold text-navy-800">{mine?.etaMins ?? '—'} min</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-navy-400">
                <Timer size={11} /> Expires
              </dt>
              <dd
                className={`tnum mt-0.5 font-bold ${urgent ? 'text-red-600' : 'text-navy-800'}`}
              >
                {expired ? 'gone' : `${remaining}s`}
              </dd>
            </div>
          </dl>

          <p className="mt-3 truncate text-xs text-navy-500">
            <MapPin size={11} className="mr-1 inline" />
            {offer.address?.zone}, {offer.address?.city} · {formatDateTime(offer.scheduledFor)}
          </p>

          {offer.notes && (
            <p className="mt-2 rounded-lg bg-navy-50 p-2.5 text-xs leading-relaxed text-navy-700">
              &ldquo;{offer.notes}&rdquo;
            </p>
          )}

          <div className="mt-3.5 flex gap-2">
            <button
              onClick={() => setDeclineOpen(true)}
              disabled={Boolean(busy) || expired}
              className="btn-outline flex-1"
            >
              <X size={15} /> Pass
            </button>
            <button
              onClick={accept}
              disabled={Boolean(busy) || expired}
              className="btn-coop flex-[2]"
            >
              {busy === 'accept' ? <Spinner size={15} /> : <Check size={15} />}
              {expired ? 'Expired' : 'Accept job'}
            </button>
          </div>
        </div>
      </article>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Pass on this job?"
        size="sm"
      >
        <p className="muted mb-4">
          It will be offered to another member. Passing often lowers your acceptance rate, which
          affects how you rank in future offers.
        </p>
        <div className="space-y-2">
          {WORKER_DECLINE_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => decline(r)}
              disabled={Boolean(busy)}
              className="btn-outline w-full justify-start"
            >
              {r}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
