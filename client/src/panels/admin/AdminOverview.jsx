import { Link } from 'react-router-dom';
import {
  Users, Activity, Banknote, ShieldAlert, PiggyBank, TrendingUp, ArrowRight, CheckCircle2, Table2,
} from 'lucide-react';
import { useState } from 'react';
import { admin as adminApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Async, StatCard, SectionHeader, Progress, Skeleton, EmptyState,
} from '../../components/UI.jsx';
import BarChart from '../../components/charts/BarChart.jsx';
import { SERIES } from '../../components/charts/tokens.js';
import { inr, inrCompact, num, pct, formatDate, relativeTime } from '../../lib/format.js';

export default function AdminOverview() {
  const [showTable, setShowTable] = useState(false);

  const { data, loading, error, reload } = useApi(() => adminApi.overview(), [], {
    pollMs: 20_000,
  });

  const { data: sos } = useApi(() => adminApi.sos(), [], { pollMs: 15_000, initial: [] });

  const trend = (data?.trend ?? []).map((d) => ({
    label: formatDate(d.date),
    workerPayout: d.workerPayout,
    commission: d.commission,
    bookings: d.bookings,
    gross: d.gross,
    date: d.date,
  }));

  return (
    <div className="space-y-8">
      {/* -------------------------------- SOS ------------------------------- */}
      {sos?.length > 0 && (
        <div className="card-pad border-red-300 bg-red-50">
          <div className="flex flex-wrap items-center gap-4">
            <ShieldAlert size={22} className="shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-red-900">
                {sos.length} open SOS alert{sos.length === 1 ? '' : 's'}
              </p>
              <p className="text-sm text-red-700">
                {sos[0].sos.raisedBy} raised an alert on {sos[0].code} ·{' '}
                {relativeTime(sos[0].sos.raisedAt)}
              </p>
            </div>
            <Link to="/admin/operations" className="btn-danger shrink-0">
              Handle now <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      <Async
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        skeleton={
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        }
      >
        {data && (
          <>
            {/* --------------------------- coop header -------------------------- */}
            {data.cooperative && (
              <section className="card overflow-hidden">
                <div className="bg-navy-900 px-6 py-5 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-navy-400">
                        Cooperative
                      </p>
                      <h1 className="mt-1 text-xl font-bold tracking-tight">
                        {data.cooperative.name}
                      </h1>
                      <p className="mt-0.5 text-sm text-navy-300">
                        {data.cooperative.code} · {data.cooperative.city} ·{' '}
                        {num(data.cooperative.stats.memberCount)} members
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-bold uppercase tracking-wider text-coop-400">
                        Undistributed dividend pool
                      </p>
                      <p className="tnum mt-1 text-3xl font-bold text-coop-400">
                        {inr(data.cooperative.dividendPool)}
                      </p>
                      <p className="mt-0.5 text-xs text-navy-400">
                        Ready to return to members at settlement
                      </p>
                    </div>
                  </div>
                </div>

                {/* Governance parameters — set by member vote, not by us. */}
                <dl className="grid grid-cols-2 divide-navy-100 sm:grid-cols-4 sm:divide-x">
                  {[
                    { label: 'Commission', value: pct(data.cooperative.governance.commissionPct * 100) },
                    { label: 'Returned as dividend', value: pct(data.cooperative.governance.dividendPoolPct * 100) },
                    { label: 'Rate floor', value: `${inr(data.cooperative.governance.minHourlyRate)}/hr` },
                    { label: 'Surge ceiling', value: `×${data.cooperative.governance.surgeCeiling}` },
                  ].map((g) => (
                    <div key={g.label} className="border-b border-navy-100 px-5 py-3.5 sm:border-b-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                        {g.label}
                      </dt>
                      <dd className="tnum mt-0.5 text-lg font-bold text-navy-900">{g.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* ---------------------------- workforce --------------------------- */}
            <section>
              <SectionHeader title="Workforce" />
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard icon={Users} label="Members" value={num(data.workforce.members)} tone="navy" />
                <StatCard
                  icon={Activity}
                  label="Online now"
                  value={num(data.workforce.online)}
                  sub={`${data.workforce.offline} offline`}
                  tone="coop"
                />
                <StatCard
                  icon={ShieldAlert}
                  label="Awaiting verification"
                  value={num(data.workforce.pendingVerification)}
                  sub={data.workforce.pendingVerification > 0 ? 'Needs your review' : 'Queue clear'}
                  tone={data.workforce.pendingVerification > 0 ? 'saffron' : 'navy'}
                />
                <StatCard
                  icon={Activity}
                  label="Live jobs"
                  value={num(data.operations.liveJobs)}
                  sub="In progress right now"
                  tone="navy"
                />
              </div>

              {data.workforce.pendingVerification > 0 && (
                <Link
                  to="/admin/verification"
                  className="card-pad mt-4 flex items-center gap-3 border-saffron-200 bg-saffron-50 transition hover:shadow-lift"
                >
                  <ShieldAlert size={18} className="shrink-0 text-saffron-600" />
                  <p className="min-w-0 flex-1 text-sm font-semibold text-saffron-900">
                    {data.workforce.pendingVerification} member
                    {data.workforce.pendingVerification === 1 ? '' : 's'} waiting on your decision
                  </p>
                  <ArrowRight size={15} className="shrink-0 text-saffron-500" />
                </Link>
              )}
            </section>

            {/* ---------------------------- operations -------------------------- */}
            <section>
              <SectionHeader title="Operations" hint="Last 30 days." />

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="card-pad">
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">
                    Fulfilment rate
                  </p>
                  <p className="tnum mt-1.5 text-3xl font-bold text-navy-900">
                    {pct(data.operations.fulfilmentRate)}
                  </p>
                  <Progress
                    value={data.operations.fulfilmentRate}
                    tone={data.operations.fulfilmentRate > 80 ? 'coop' : 'saffron'}
                    className="mt-3"
                  />
                  <p className="muted mt-2">
                    {num(data.operations.completed)} completed of {num(data.operations.bookings30d)}{' '}
                    booked
                  </p>
                </div>

                <StatCard
                  icon={TrendingUp}
                  label="Gross volume"
                  value={inrCompact(data.finance.gross30d)}
                  sub="Completed bookings, 30 days"
                  tone="navy"
                />

                <StatCard
                  icon={PiggyBank}
                  label="Reached members"
                  value={inrCompact(data.finance.workerPayout30d)}
                  sub={`${pct(data.finance.payoutSharePct)} of gross volume`}
                  tone="coop"
                />
              </div>
            </section>

            {/* ------------------------------ trend ----------------------------- */}
            <section className="card-pad">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="panel-title">Revenue split, last 14 days</h3>
                  <p className="muted mt-0.5">
                    How each day&rsquo;s gross volume divided between members and the cooperative.
                  </p>
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
                        <th className="text-right">Gross</th>
                        <th className="text-right">To members</th>
                        <th className="text-right">Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((d) => (
                        <tr key={d.date}>
                          <td>{d.label}</td>
                          <td className="tnum text-right">{d.bookings}</td>
                          <td className="tnum text-right">{inr(d.gross)}</td>
                          <td className="tnum text-right font-semibold text-coop-700">
                            {inr(d.workerPayout)}
                          </td>
                          <td className="tnum text-right">{inr(d.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <BarChart
                  data={trend}
                  series={[
                    { key: 'workerPayout', label: 'To members', color: SERIES.workerPayout },
                    { key: 'commission', label: 'Cooperative commission', color: SERIES.commission },
                  ]}
                  format={inr}
                  height={220}
                  emptyMessage="No completed bookings in this period"
                />
              )}
            </section>

            {/* ---------------------------- shortcuts --------------------------- */}
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                { to: '/admin/verification', icon: CheckCircle2, title: 'Verification queue', body: 'Approve, reject or suspend members' },
                { to: '/admin/settlement', icon: Banknote, title: 'Run settlement', body: 'Pay members and distribute the dividend' },
                { to: '/admin/insights', icon: TrendingUp, title: 'Demand insights', body: 'Where to recruit and retrain' },
              ].map((c) => (
                <Link key={c.to} to={c.to} className="card-pad transition hover:shadow-lift">
                  <c.icon size={20} className="text-navy-500" />
                  <p className="mt-3 font-bold tracking-tight text-navy-900">{c.title}</p>
                  <p className="muted mt-1">{c.body}</p>
                </Link>
              ))}
            </section>
          </>
        )}
      </Async>
    </div>
  );
}
