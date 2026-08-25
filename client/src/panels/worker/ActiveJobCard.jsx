import { useState } from 'react';
import {
  Navigation, MapPin, Phone, KeyRound, Check, ClipboardList, XCircle, ShieldAlert,
} from 'lucide-react';
import { workerPanel, bookings as bookingApi } from '../../api/index.js';
import { Spinner, Modal, StatusPill } from '../../components/UI.jsx';
import { inr, formatDateTime } from '../../lib/format.js';
import { NEXT_WORKER_ACTION } from '../../lib/status.js';
import { useToast } from '../../context/ToastContext.jsx';

/**
 * The worker's view of the job they are currently on.
 *
 * The two OTP gates live here: the customer reads a code out to start the work,
 * and another to close it. The worker cannot advance past either without it,
 * which is what stops a job being marked done from the other side of the city.
 */
export default function ActiveJobCard({ job, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [otpOpen, setOtpOpen] = useState(null); // 'start' | 'complete'
  const [cancelOpen, setCancelOpen] = useState(false);

  const next = NEXT_WORKER_ACTION[job.status];

  const run = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      if (msg) toast.success(msg);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const advance = () => {
    if (next?.key === 'enroute') return run(() => workerPanel.enroute(job._id), 'Marked on the way');
    if (next?.key === 'arrived') return run(() => workerPanel.arrived(job._id), 'Marked arrived');
    if (next?.key === 'start') return setOtpOpen('start');
    if (next?.key === 'complete') return setOtpOpen('complete');
    return undefined;
  };

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${job.address.location.coordinates[1]},${job.address.location.coordinates[0]}`;

  return (
    <>
      <article className="card overflow-hidden">
        <div className="bg-navy-900 px-5 py-4 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold tracking-tight">{job.serviceName}</h3>
                <StatusPill status={job.status} />
              </div>
              <p className="mt-0.5 text-xs text-navy-300">
                {job.packageName} · <span className="font-mono">{job.code}</span>
              </p>
            </div>

            <div className="text-right">
              <p className="tnum text-xl font-bold text-coop-400">
                {inr(job.pricing?.workerPayout)}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-navy-400">your payout</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          {/* --------------------------- customer --------------------------- */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-navy-900">{job.customer?.name}</p>
              <p className="mt-0.5 flex items-start gap-1.5 text-xs text-navy-500">
                <MapPin size={12} className="mt-0.5 shrink-0" />
                <span>
                  {job.address.line1}
                  {job.address.landmark && `, ${job.address.landmark}`}
                  <span className="block">
                    {job.address.zone}, {job.address.city}
                  </span>
                </span>
              </p>
              <p className="mt-1.5 text-xs text-navy-500">{formatDateTime(job.scheduledFor)}</p>
            </div>

            <div className="flex shrink-0 gap-2">
              {job.customer?.phone && (
                <a href={`tel:${job.customer.phone}`} className="btn-outline btn-sm">
                  <Phone size={13} /> Call
                </a>
              )}
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">
                <Navigation size={13} /> Navigate
              </a>
            </div>
          </div>

          {job.notes && (
            <p className="mt-3.5 rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
              <strong className="font-bold">Customer note:</strong> {job.notes}
            </p>
          )}

          {/* --------------------------- checklist -------------------------- */}
          {job.service?.checklist?.length > 0 && (
            <div className="mt-4 rounded-lg border border-navy-100 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-navy-500">
                <ClipboardList size={12} /> Job checklist
              </p>
              <ul className="space-y-1.5">
                {job.service.checklist.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-navy-700">
                    <Check size={13} className="mt-0.5 shrink-0 text-coop-600" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---------------------------- actions --------------------------- */}
          <div className="mt-5 flex flex-wrap gap-2">
            {next && (
              <button onClick={advance} disabled={busy} className={`btn-${next.tone} flex-1`}>
                {busy ? <Spinner size={15} /> : next.key === 'start' || next.key === 'complete' ? <KeyRound size={15} /> : <Navigation size={15} />}
                {next.label}
              </button>
            )}

            <button
              onClick={() => run(() => bookingApi.sos(job._id), 'SOS raised — the board has been notified')}
              disabled={busy || job.sos?.raised}
              className="btn-danger"
            >
              <ShieldAlert size={15} />
            </button>

            {job.status !== 'in_progress' && (
              <button onClick={() => setCancelOpen(true)} disabled={busy} className="btn-outline">
                <XCircle size={15} />
              </button>
            )}
          </div>
        </div>
      </article>

      <OtpModal
        mode={otpOpen}
        onClose={() => setOtpOpen(null)}
        onSubmit={async (code) => {
          const fn =
            otpOpen === 'start'
              ? () => workerPanel.start(job._id, code)
              : () => workerPanel.complete(job._id, code);

          await run(fn, otpOpen === 'start' ? 'Work started' : 'Job completed — payment released');
          setOtpOpen(null);
        }}
      />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this job?"
        size="sm"
      >
        <p className="muted mb-4">
          The customer will be told and the job goes back out to other professionals. Frequent
          cancellations affect your standing in the cooperative.
        </p>
        <div className="space-y-2">
          {['Emergency came up', 'Vehicle broke down', 'Unwell', 'Address is unreachable'].map((r) => (
            <button
              key={r}
              onClick={async () => {
                await run(() => workerPanel.cancelJob(job._id, r), 'Job cancelled');
                setCancelOpen(false);
              }}
              disabled={busy}
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

/* -------------------------------------------------------------------------- */

function OtpModal({ mode, onClose, onSubmit }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const isStart = mode === 'start';

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(code);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(mode)}
      onClose={onClose}
      size="sm"
      title={isStart ? 'Enter the start code' : 'Enter the completion code'}
      footer={
        <>
          <button onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button onClick={submit} disabled={code.length !== 4 || busy} className="btn-coop">
            {busy ? <Spinner size={14} /> : <Check size={14} />}
            {isStart ? 'Start work' : 'Complete job'}
          </button>
        </>
      }
    >
      <p className="muted mb-5">
        {isStart
          ? 'Ask the customer for the 4-digit start code shown in their app. Work cannot begin without it.'
          : 'Once the customer is satisfied, ask for the 4-digit completion code. This releases your payment.'}
      </p>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={(e) => e.key === 'Enter' && code.length === 4 && submit()}
        inputMode="numeric"
        autoFocus
        placeholder="0000"
        aria-label="4-digit code"
        className="input tnum text-center font-mono text-3xl font-bold tracking-[0.5em]"
      />
    </Modal>
  );
}
