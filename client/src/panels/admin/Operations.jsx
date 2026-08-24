import { useState } from 'react';
import { Activity, ShieldAlert, Check, Phone } from 'lucide-react';
import { admin as adminApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Async, SectionHeader, EmptyState, StatusPill, ChipRow, Skeleton, Modal, Spinner,
} from '../../components/UI.jsx';
import { inr, formatDateTime, relativeTime } from '../../lib/format.js';
import { BOOKING_FILTERS } from './constants.js';
import { useToast } from '../../context/ToastContext.jsx';

export default function Operations() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [resolving, setResolving] = useState(null);

  const { data, loading, error, reload } = useApi(
    () => adminApi.bookings({ status: status || undefined, limit: 50 }),
    [status],
    { pollMs: 20_000 },
  );

  const {
    data: sos,
    reload: reloadSos,
  } = useApi(() => adminApi.sos(), [], { pollMs: 15_000, initial: [] });

  const resolveSos = async (booking, reason) => {
    try {
      await adminApi.resolveSos(booking._id, reason);
      toast.success(`SOS on ${booking.code} marked resolved`);
      setResolving(null);
      reloadSos({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* -------------------------------- SOS ------------------------------- */}
      <section>
        <SectionHeader
          title="Safety alerts"
          hint="Raised by either side of a job. These come first, before anything else on this screen."
        />

        {sos?.length ? (
          <div className="space-y-3">
            {sos.map((b) => (
              <article key={b._id} className="card-pad border-red-300 bg-red-50">
                <div className="flex flex-wrap items-start gap-4">
                  <ShieldAlert size={20} className="mt-0.5 shrink-0 text-red-600" />

                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-red-900">
                      {b.sos.raisedBy === 'customer' ? 'Customer' : 'Member'} raised an alert ·{' '}
                      <span className="font-mono">{b.code}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-red-800">
                      {b.serviceName} · {b.address?.zone}, {b.address?.city} ·{' '}
                      {relativeTime(b.sos.raisedAt)}
                    </p>

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {b.customer?.phone && (
                        <a href={`tel:${b.customer.phone}`} className="btn-outline btn-sm">
                          <Phone size={12} /> Customer: {b.customer.name}
                        </a>
                      )}
                      {b.worker?.displayName && (
                        <span className="badge-navy">Member: {b.worker.displayName}</span>
                      )}
                    </div>
                  </div>

                  <button onClick={() => setResolving(b)} className="btn-primary btn-sm shrink-0">
                    <Check size={13} /> Mark resolved
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="card-pad border-coop-200 bg-coop-50">
            <p className="flex items-center gap-2.5 text-sm font-semibold text-coop-900">
              <Check size={16} /> No open safety alerts.
            </p>
          </div>
        )}
      </section>

      {/* ------------------------------ bookings ---------------------------- */}
      <section>
        <SectionHeader
          title="All bookings"
          hint="Everything routed through your cooperative, newest first."
        />

        <div className="mb-4">
          <ChipRow options={BOOKING_FILTERS} value={status} onChange={setStatus} allLabel="All" />
        </div>

        <Async
          loading={loading}
          error={error}
          data={data}
          onRetry={reload}
          skeleton={<Skeleton className="h-96 rounded-xl" />}
          empty={
            <EmptyState
              icon={Activity}
              title="No bookings match"
              hint="Try a different status filter."
            />
          }
        >
          <div className="card table-wrap p-5">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Service</th>
                  <th>Customer</th>
                  <th>Member</th>
                  <th>Zone</th>
                  <th>Scheduled</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">To member</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((b) => (
                  <tr key={b._id}>
                    <td className="font-mono text-xs">{b.code}</td>
                    <td className="font-medium">{b.serviceName}</td>
                    <td>{b.customer?.name ?? '—'}</td>
                    <td>{b.worker?.displayName ?? <span className="text-navy-400">unassigned</span>}</td>
                    <td className="text-xs">{b.address?.zone ?? '—'}</td>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(b.scheduledFor)}</td>
                    <td className="tnum text-right font-semibold">{inr(b.pricing?.total)}</td>
                    <td className="tnum text-right text-coop-700">{inr(b.pricing?.workerPayout)}</td>
                    <td>
                      <StatusPill status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Async>
      </section>

      <Modal
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
        title="Resolve this alert"
        size="sm"
      >
        <p className="muted mb-4">
          Record what happened. This is kept on the booking&rsquo;s timeline as an audit trail.
        </p>
        <div className="space-y-2">
          {[
            'Spoke to both parties, situation is safe',
            'False alarm — raised by mistake',
            'Job cancelled and member reassigned',
            'Escalated to the board for review',
          ].map((r) => (
            <button
              key={r}
              onClick={() => resolveSos(resolving, r)}
              className="btn-outline w-full justify-start text-left"
            >
              {r}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
