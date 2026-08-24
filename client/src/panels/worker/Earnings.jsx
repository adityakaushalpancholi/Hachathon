import { Wallet, PiggyBank, Banknote, TrendingUp, Table2 } from 'lucide-react';
import { useState } from 'react';
import { workerPanel } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { Async, StatCard, SectionHeader, EmptyState, Skeleton } from '../../components/UI.jsx';
import BarChart from '../../components/charts/BarChart.jsx';
import { SERIES } from '../../components/charts/tokens.js';
import { inr, formatDate, titleCase } from '../../lib/format.js';

export default function Earnings() {
  const [showTable, setShowTable] = useState(false);
  const { data, loading, error, reload } = useApi(() => workerPanel.earnings(), []);

  const chartData = (data?.daily ?? []).map((d) => ({
    label: formatDate(d.date),
    earned: d.earned,
    jobs: d.jobs,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SectionHeader
        title="Earnings"
        hint="What you have made, what is owed to you, and your share of the cooperative surplus."
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
        {data && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard icon={Wallet} label="Lifetime" value={inr(data.lifetime)} tone="navy" />
              <StatCard
                icon={TrendingUp}
                label="This month"
                value={inr(data.thisMonth)}
                sub={`${data.jobsThisMonth} jobs`}
                tone="coop"
              />
              <StatCard
                icon={Banknote}
                label="Awaiting payout"
                value={inr(data.pendingPayout)}
                sub="Settles this cycle"
                tone="saffron"
              />
              <StatCard
                icon={PiggyBank}
                label="Dividends received"
                value={inr(data.dividendsReceived)}
                sub="Your share of the surplus"
                tone="coop"
              />
            </div>

            {/* --------------------------- daily chart -------------------------- */}
            <section className="card-pad">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="panel-title">Last 14 days</h3>
                  <p className="muted mt-0.5">What reached you, after commission.</p>
                </div>
                <button
                  onClick={() => setShowTable((s) => !s)}
                  className="btn-outline btn-sm"
                  aria-pressed={showTable}
                >
                  <Table2 size={13} /> {showTable ? 'Show chart' : 'Show table'}
                </button>
              </div>

              {showTable ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="text-right">Jobs</th>
                        <th className="text-right">Earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.daily ?? []).map((d) => (
                        <tr key={d.date}>
                          <td>{formatDate(d.date)}</td>
                          <td className="tnum text-right">{d.jobs}</td>
                          <td className="tnum text-right font-semibold">{inr(d.earned)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <BarChart
                  data={chartData}
                  series={[{ key: 'earned', label: 'Earned', color: SERIES.workerPayout }]}
                  format={inr}
                  height={210}
                  emptyMessage="No completed jobs in the last 14 days"
                />
              )}
            </section>

            {/* ---------------------------- payouts ---------------------------- */}
            <section>
              <SectionHeader
                title="Settlements"
                hint="Each run pays your job earnings plus your share of the cooperative's dividend pool."
              />

              {data.payouts?.length ? (
                <div className="card table-wrap p-5">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th className="text-right">Jobs</th>
                        <th className="text-right">Earnings</th>
                        <th className="text-right">Dividend</th>
                        <th className="text-right">Net</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payouts.map((p) => (
                        <tr key={p._id}>
                          <td className="font-mono text-xs">{p.period.label}</td>
                          <td className="tnum text-right">{p.bookings?.length ?? 0}</td>
                          <td className="tnum text-right">{inr(p.net - p.dividendShare)}</td>
                          <td className="tnum text-right font-semibold text-coop-700">
                            +{inr(p.dividendShare)}
                          </td>
                          <td className="tnum text-right font-bold">{inr(p.net)}</td>
                          <td>
                            <span
                              className={
                                p.status === 'paid'
                                  ? 'badge-coop'
                                  : p.status === 'failed'
                                    ? 'badge-red'
                                    : 'badge-amber'
                              }
                            >
                              {titleCase(p.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={Banknote}
                  title="No settlements yet"
                  hint="Your first payout appears after the cooperative runs its next settlement cycle."
                />
              )}
            </section>

            <div className="card-pad border-coop-200 bg-coop-50">
              <div className="flex items-start gap-3.5">
                <PiggyBank size={20} className="mt-0.5 shrink-0 text-coop-700" />
                <div>
                  <p className="font-bold text-coop-900">Why there is a dividend line</p>
                  <p className="mt-1 text-sm leading-relaxed text-coop-800">
                    The commission your bookings pay does not leave the cooperative. A fixed share
                    of it — set by member vote — is pooled and paid back out at settlement, in
                    proportion to the work each member actually did. On an investor-owned platform
                    that money is margin; here it is yours.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
