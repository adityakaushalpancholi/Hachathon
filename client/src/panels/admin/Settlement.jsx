import { useState } from 'react';
import { Banknote, PiggyBank, Play, Check, Users, Calculator } from 'lucide-react';
import { admin as adminApi } from '../../api/index.js';
import { useApi, useMutation } from '../../hooks/useApi.js';
import {
  Async, SectionHeader, EmptyState, StatCard, Spinner, Avatar, Modal, Skeleton,
} from '../../components/UI.jsx';
import { inr, inrCompact, num, pct, formatDate, titleCase } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';

/**
 * Settlement.
 *
 * A payout is the sum of the `workerPayout` line from every booking the
 * professional completed in the period — already net of commission and platform
 * fee, because the split is computed once at booking time and never recomputed
 * the general body voted for, and the reason this screen shows a contribution
 * percentage next to every line.
 */
export default function Settlement() {
  const toast = useToast();
  const [preview, setPreview] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    data: payouts,
    loading,
    error,
    reload,
  } = useApi(() => adminApi.payouts(), []);

  const buildPreview = useMutation(async () => {
    const result = await adminApi.previewSettlement({
      from: new Date(Date.now() - 7 * 86400_000).toISOString(),
      to: new Date().toISOString(),
    });
    setPreview(result);
    if (!result.lines?.length) toast.info('No completed jobs in the last 7 days');
    return result;
  });

  const runSettlement = useMutation(async () => {
    const result = await adminApi.runSettlement({
      from: new Date(Date.now() - 7 * 86400_000).toISOString(),
      to: new Date().toISOString(),
    });
    toast.success(`${result.payouts.length} draft payouts created for ${result.settlement.period.label}`);
    setConfirmOpen(false);
    setPreview(null);
    reload({ silent: true });
    return result;
  });

  const approve = async (payout) => {
    try {
      await adminApi.approvePayout(payout._id);
      toast.success(`Paid ${inr(payout.net)} to the professional`);
      reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Settlement"
        hint="Pay professionals for the work they completed in this period."
        action={
          <button
            onClick={() => buildPreview.mutate()}
            disabled={buildPreview.pending}
            className="btn-primary"
          >
            {buildPreview.pending ? <Spinner size={15} /> : <Calculator size={15} />}
            Build this week&rsquo;s run
          </button>
        }
      />

      {buildPreview.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {buildPreview.error.message}
        </div>
      )}

      {/* ------------------------------ preview ----------------------------- */}
      {preview?.lines?.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-navy-100 bg-navy-50 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="panel-title">
                  Draft run · <span className="font-mono">{preview.period.label}</span>
                </h3>
                <p className="muted mt-0.5">
                  {formatDate(preview.period.from)} to {formatDate(preview.period.to)} ·{' '}
                  {preview.cooperative}
                </p>
              </div>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={runSettlement.pending}
                className="btn-coop"
              >
                {runSettlement.pending ? <Spinner size={15} /> : <Play size={15} />}
                Commit run
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-navy-100 sm:grid-cols-5">
            {[
              { label: 'Professionals', value: num(preview.totals.members) },
              { label: 'Jobs', value: num(preview.totals.jobs) },
              { label: 'Gross', value: inrCompact(preview.totals.gross) },
              { label: 'Commission', value: inrCompact(preview.totals.commission), tone: 'coop' },
              { label: 'Total payable', value: inrCompact(preview.totals.payable), tone: 'strong' },
            ].map((t) => (
              <div key={t.label} className="bg-white px-4 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                  {t.label}
                </p>
                <p
                  className={`tnum mt-0.5 text-lg font-bold ${
                    t.tone === 'coop' ? 'text-coop-700' : 'text-navy-900'
                  }`}
                >
                  {t.value}
                </p>
              </div>
            ))}
          </div>

          <div className="table-wrap p-5">
            <table className="table">
              <thead>
                <tr>
                  <th>Professional</th>
                  <th className="text-right">Jobs</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Commission</th>
                  <th className="text-right">Earnings</th>
                  <th className="text-right">Contribution</th>
                  <th className="text-right">Net payable</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l) => (
                  <tr key={l.worker}>
                    <td className="font-mono text-xs">{String(l.worker).slice(-6)}</td>
                    <td className="tnum text-right">{l.jobs}</td>
                    <td className="tnum text-right">{inr(l.gross)}</td>
                    <td className="tnum text-right text-navy-500">−{inr(l.coopCommission)}</td>
                    <td className="tnum text-right">{inr(l.earnings)}</td>
                    <td className="tnum text-right text-xs text-navy-500">{l.contributionPct}%</td>
                    <td className="tnum text-right font-bold">{inr(l.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-navy-100 px-5 py-3.5 text-xs leading-relaxed text-navy-500">
            Earnings are net of commission and the platform fee, both taken at booking time.
            Contribution is this professional&rsquo;s share of the period&rsquo;s gross volume,
            shown so an unusually large payout is easy to explain.
          </p>
        </section>
      )}

      {preview && !preview.lines?.length && (
        <EmptyState
          icon={Calculator}
          title="Nothing to settle"
          hint="No jobs were completed in this period, so there is nothing to pay out."
        />
      )}

      {/* ------------------------------ payouts ----------------------------- */}
      <section>
        <SectionHeader title="Payout ledger" hint="Draft runs await approval; approved runs are paid." />

        <Async
          loading={loading}
          error={error}
          data={payouts}
          onRetry={reload}
          skeleton={<Skeleton className="h-64 rounded-xl" />}
          empty={
            <EmptyState
              icon={Banknote}
              title="No settlement runs yet"
              hint="Build this week's run to generate draft payouts for your professionals."
            />
          }
        >
          <div className="space-y-3">
            {(payouts ?? []).map((p) => (
              <article key={p._id} className="card flex flex-wrap items-center gap-4 p-4">
                <Avatar name={p.worker?.displayName} src={p.worker?.photo} size={40} />

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-900">
                    {p.worker?.displayName ?? 'Member'}
                  </p>
                  <p className="text-xs text-navy-500">
                    <span className="font-mono">{p.period.label}</span> · {p.bookings?.length ?? 0}{' '}
                    jobs
                    {p.reference && ` · ${p.reference}`}
                  </p>
                </div>

                <div className="text-right">
                  <p className="tnum font-bold text-navy-900">{inr(p.net)}</p>
                </div>

                {p.status === 'paid' ? (
                  <span className="badge-coop shrink-0">
                    <Check size={12} /> Paid
                  </span>
                ) : (
                  <button onClick={() => approve(p)} className="btn-coop btn-sm shrink-0">
                    <Banknote size={13} /> Approve &amp; pay
                  </button>
                )}
              </article>
            ))}
          </div>
        </Async>
      </section>

      {/* ----------------------------- confirm ------------------------------ */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Commit this settlement run?"
        size="sm"
        footer={
          <>
            <button onClick={() => setConfirmOpen(false)} className="btn-outline">
              Cancel
            </button>
            <button
              onClick={() => runSettlement.mutate()}
              disabled={runSettlement.pending}
              className="btn-coop"
            >
              {runSettlement.pending ? <Spinner size={14} /> : <Play size={14} />} Commit run
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-navy-700">
          This creates draft payouts for{' '}
          <strong>{preview?.totals?.members ?? 0} professionals</strong>, totalling{' '}
          <strong>{inr(preview?.totals?.payable)}</strong>.
        </p>
        <p className="muted mt-3">
          Drafts still need approving individually before money moves. Re-running the same period
          updates the existing drafts rather than duplicating them.
        </p>
      </Modal>
    </div>
  );
}
