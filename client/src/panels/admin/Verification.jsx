import { useState } from 'react';
import { ShieldCheck, Search, FileCheck2, Check, X, Ban, Star, Briefcase } from 'lucide-react';
import { admin as adminApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Async, SectionHeader, EmptyState, Avatar, RatingStars, VerificationBadge, Modal, Spinner, ChipRow, Skeleton,
} from '../../components/UI.jsx';
import { inr, titleCase, formatDate, relativeTime } from '../../lib/format.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useToast } from '../../context/ToastContext.jsx';

const STATUSES = [
  { value: 'pending', label: 'Awaiting review' },
  { value: 'verified', label: 'Verified' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
];

/**
 * The verification queue.
 *
 * Admitting someone to the platform is the decision that carries the most risk,
 * so the decision is deliberately not one click: the reviewer opens the file,
 * sees the documents and leaves a note that reaches the applicant.
 */
export default function Verification() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  const query = useDebounced(q, 350);

  const { data, loading, error, reload } = useApi(
    () => adminApi.workers({ status: status || undefined, q: query || undefined, limit: 50 }),
    [status, query],
  );

  const decide = async (worker, decision, note) => {
    try {
      await adminApi.setVerification(worker._id, {
        status: decision,
        note,
        backgroundCheckClear: decision === 'verified',
      });
      toast.success(
        decision === 'verified'
          ? `${worker.displayName} is now verified and can take jobs`
          : `${worker.displayName} marked ${decision}`,
      );
      setSelected(null);
      reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Member verification"
        hint="Identity and background documents, reviewed by a person before anyone takes a job."
      />

      <div className="space-y-3">
        <ChipRow options={STATUSES} value={status} onChange={setStatus} allLabel="Everyone" />

        <div className="relative max-w-sm">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="input pl-10"
            aria-label="Search professionals"
          />
        </div>
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
            icon={ShieldCheck}
            title={status === 'pending' ? 'Queue is clear' : 'Nobody matches'}
            hint={
              status === 'pending'
                ? 'Every application has been reviewed. New sign-ups will appear here.'
                : 'Try a different filter or search term.'
            }
          />
        }
      >
        <>
          <p className="muted">{data?.meta?.total ?? data?.length ?? 0} professionals</p>

          <div className="space-y-3">
            {(data ?? []).map((w) => (
              <article key={w._id} className="card p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <Avatar name={w.displayName} src={w.photo} size={48} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-navy-900">{w.displayName}</p>
                      <VerificationBadge status={w.verification?.status} />
                    </div>

                    <p className="mt-0.5 text-sm text-navy-500">
                      {titleCase(w.skills?.[0]?.skillTag)} · {w.experienceYears} years ·{' '}
                      {inr(w.hourlyRate)}/hr
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
                      <span className="font-mono">{w.user?.membershipId}</span>
                      <span>{w.user?.phone}</span>
                      <span>{w.city}</span>
                      <span>Joined {formatDate(w.user?.createdAt ?? w.createdAt)}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-navy-600">
                        <Briefcase size={12} className="text-navy-400" />
                        <strong className="tnum">{w.stats?.jobsCompleted ?? 0}</strong> jobs
                      </span>
                      {w.rating?.count > 0 && (
                        <RatingStars value={w.rating.average} count={w.rating.count} size={11} />
                      )}
                      <span className="inline-flex items-center gap-1.5 text-navy-600">
                        <FileCheck2 size={12} className="text-navy-400" />
                        {w.verification?.documents?.filter((d) => d.status === 'approved').length ?? 0}
                        /{w.verification?.documents?.length ?? 0} documents
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setSelected(w)} className="btn-outline btn-sm">
                      Open file
                    </button>
                    {w.verification?.status === 'pending' && (
                      <button
                        onClick={() => decide(w, 'verified', 'Documents checked and approved')}
                        className="btn-coop btn-sm"
                      >
                        <Check size={13} /> Verify
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      </Async>

      <WorkerFileModal worker={selected} onClose={() => setSelected(null)} onDecide={decide} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function WorkerFileModal({ worker, onClose, onDecide }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);

  if (!worker) return null;

  const act = async (decision) => {
    setBusy(decision);
    await onDecide(worker, decision, note || undefined);
    setBusy(null);
    setNote('');
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={worker.displayName}
      size="lg"
      footer={
        <>
          <button
            onClick={() => act('suspended')}
            disabled={Boolean(busy)}
            className="btn-danger mr-auto"
          >
            {busy === 'suspended' ? <Spinner size={14} /> : <Ban size={14} />} Suspend
          </button>
          <button onClick={() => act('rejected')} disabled={Boolean(busy)} className="btn-outline">
            {busy === 'rejected' ? <Spinner size={14} /> : <X size={14} />} Reject
          </button>
          <button onClick={() => act('verified')} disabled={Boolean(busy)} className="btn-coop">
            {busy === 'verified' ? <Spinner size={14} /> : <Check size={14} />} Verify member
          </button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <Avatar name={worker.displayName} src={worker.photo} size={56} />
        <div className="min-w-0 flex-1">
          <VerificationBadge status={worker.verification?.status} />
          <p className="mt-2 text-sm text-navy-600">{worker.bio}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-navy-100 pt-4 text-sm sm:grid-cols-4">
        {[
          { label: 'Trade', value: titleCase(worker.skills?.[0]?.skillTag) },
          { label: 'Experience', value: `${worker.experienceYears} yrs` },
          { label: 'Rate', value: `${inr(worker.hourlyRate)}/hr` },
          { label: 'Radius', value: `${worker.serviceRadiusKm} km` },
          { label: 'Jobs done', value: worker.stats?.jobsCompleted ?? 0 },
          { label: 'Cancelled', value: worker.stats?.jobsCancelled ?? 0 },
          { label: 'Acceptance', value: `${worker.acceptanceRate ?? 0}%` },
          { label: 'On time', value: `${worker.onTimeRate ?? 0}%` },
        ].map((f) => (
          <div key={f.label}>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
              {f.label}
            </dt>
            <dd className="tnum mt-0.5 font-bold text-navy-900">{f.value}</dd>
          </div>
        ))}
      </dl>

      {/* --------------------------- documents ---------------------------- */}
      <div className="mt-5 border-t border-navy-100 pt-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-navy-500">Documents</p>
        <div className="space-y-2">
          {worker.verification?.documents?.map((d) => (
            <div
              key={d._id ?? d.type}
              className="flex items-center gap-3 rounded-lg border border-navy-100 p-3"
            >
              <FileCheck2
                size={16}
                className={d.status === 'approved' ? 'text-coop-600' : 'text-navy-400'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-900">{titleCase(d.type)}</p>
                {d.number && (
                  <p className="font-mono text-xs text-navy-500">{d.number}</p>
                )}
              </div>
              <span className={d.status === 'approved' ? 'badge-coop' : 'badge-amber'}>
                {titleCase(d.status)}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-navy-500">
          Document numbers are masked in this prototype. A production deployment would keep the
          originals in an encrypted vault, never in the application database.
        </p>
      </div>

      {/* ------------------------------ note ------------------------------ */}
      <div className="mt-5 border-t border-navy-100 pt-4">
        <label htmlFor="note" className="label">
          Note to the applicant
        </label>
        <textarea
          id="note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you check, and what does the applicant need to know?"
          className="input resize-none"
          maxLength={500}
        />
        <p className="muted mt-1.5">This is sent to them as a notification.</p>
      </div>

      {worker.verification?.verifiedAt && (
        <p className="mt-4 border-t border-navy-100 pt-3 text-xs text-navy-400">
          Last decision {relativeTime(worker.verification.verifiedAt)}
          {worker.verification.note && ` — “${worker.verification.note}”`}
        </p>
      )}
    </Modal>
  );
}
