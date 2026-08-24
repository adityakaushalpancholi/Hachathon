import { useState } from 'react';
import { TrendingUp, Users, MapPin, Flame, Table2, Info } from 'lucide-react';
import { insights as insightsApi, admin as adminApi, services as serviceApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Async, SectionHeader, EmptyState, ChipRow, Skeleton, Progress,
} from '../../components/UI.jsx';
import LineChart from '../../components/charts/LineChart.jsx';
import BarChart from '../../components/charts/BarChart.jsx';
import { SERIES, SEQUENTIAL, sequentialStep } from '../../components/charts/tokens.js';
import { inr, inrCompact, num, pct, titleCase } from '../../lib/format.js';
import { RECOMMENDATION_META } from './constants.js';

export default function Insights() {
  const [skillTag, setSkillTag] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const { data: services } = useApi(() => serviceApi.list({ limit: 50 }), []);

  const forecast = useApi(
    () => insightsApi.forecast({ skillTag: skillTag || undefined, horizonHours: 24 }),
    [skillTag],
  );

  const profiles = useApi(
    () => insightsApi.profiles({ skillTag: skillTag || undefined }),
    [skillTag],
  );

  const gaps = useApi(() => adminApi.workforce(), []);
  const zones = useApi(() => adminApi.heatmap({ days: 30 }), []);
  const surge = useApi(() => insightsApi.surge(), [], { pollMs: 30_000 });

  const forecastData = (forecast.data?.points ?? []).map((p) => ({
    label: p.label,
    value: p.expectedBookings,
    confidence: p.confidence,
  }));

  const hourlyData = (profiles.data?.hourly ?? []).map((h) => ({
    label: h.label.slice(0, 2),
    bookings: h.bookings,
  }));

  const weekdayData = (profiles.data?.weekday ?? []).map((d) => ({
    label: d.day,
    bookings: d.bookings,
  }));

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Demand insights"
        hint="Computed from your booking history. Members can see the same picture — nothing here is a black box."
      />

      <ChipRow
        options={(services ?? []).map((s) => ({ value: s.skillTag, label: s.name }))}
        value={skillTag}
        onChange={setSkillTag}
        allLabel="All trades"
      />

      {/* ------------------------------ forecast ---------------------------- */}
      <section className="card-pad">
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="panel-title">Next 24 hours</h3>
            <p className="muted mt-0.5">
              Expected bookings {skillTag ? `for ${titleCase(skillTag)}` : 'across all trades'}.
            </p>
          </div>
          {forecast.data?.peak && (
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                Busiest hour
              </p>
              <p className="tnum text-lg font-bold text-navy-900">
                {forecast.data.peak.label} · {forecast.data.peak.expectedBookings} jobs
              </p>
            </div>
          )}
        </div>

        <Async
          loading={forecast.loading}
          error={forecast.error}
          data={forecast.data}
          onRetry={forecast.reload}
          skeleton={<Skeleton className="h-52 rounded-lg" />}
        >
          <div className="mt-5">
            <LineChart
              data={forecastData}
              color={SERIES.forecast}
              height={200}
              format={(v) => `${v} jobs`}
              showConfidence
              emptyMessage="Not enough history to forecast yet"
            />
          </div>

          <p className="mt-4 flex items-start gap-2 border-t border-navy-100 pt-3.5 text-xs leading-relaxed text-navy-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Projected by decomposing your history into an hour-of-day and a day-of-week profile
              and applying both to a 14-day volume baseline of{' '}
              <strong className="tnum text-navy-700">
                {forecast.data?.baselinePerHour ?? 0}
              </strong>{' '}
              bookings/hour. Confidence decays across the horizon — hover any point to see it.
            </span>
          </p>
        </Async>
      </section>

      {/* ----------------------------- profiles ----------------------------- */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card-pad">
          <h3 className="panel-title">When people book</h3>
          <p className="muted mb-5 mt-0.5">Bookings by hour of day, last 30 days.</p>

          <Async
            loading={profiles.loading}
            error={profiles.error}
            data={profiles.data}
            onRetry={profiles.reload}
            skeleton={<Skeleton className="h-48 rounded-lg" />}
          >
            <BarChart
              data={hourlyData}
              series={[{ key: 'bookings', label: 'Bookings', color: SERIES.workerPayout }]}
              format={num}
              height={180}
            />
          </Async>
        </div>

        <div className="card-pad">
          <h3 className="panel-title">Which days</h3>
          <p className="muted mb-5 mt-0.5">Bookings by weekday, last 60 days.</p>

          <Async
            loading={profiles.loading}
            error={profiles.error}
            data={profiles.data}
            onRetry={profiles.reload}
            skeleton={<Skeleton className="h-48 rounded-lg" />}
          >
            <BarChart
              data={weekdayData}
              series={[{ key: 'bookings', label: 'Bookings', color: SERIES.workerPayout }]}
              format={num}
              height={180}
            />
          </Async>
        </div>
      </section>

      {/* ---------------------------- live surge ---------------------------- */}
      <section className="card-pad">
        <h3 className="panel-title">Live demand pressure</h3>
        <p className="muted mb-5 mt-0.5">
          The current multiplier per trade, with the open requests and available members that
          produced it. Published openly — members see the same board.
        </p>

        <Async
          loading={surge.loading}
          error={surge.error}
          data={surge.data}
          onRetry={surge.reload}
          skeleton={<Skeleton className="h-40 rounded-lg" />}
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th className="text-right">Open requests</th>
                  <th className="text-right">Members free</th>
                  <th className="text-right">Multiplier</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {(surge.data ?? []).map((s) => (
                  <tr key={s.skillTag}>
                    <td className="font-medium">{s.service}</td>
                    <td className="tnum text-right">{s.openDemand}</td>
                    <td className="tnum text-right">{s.availableSupply}</td>
                    <td className="tnum text-right font-bold">×{s.multiplier.toFixed(2)}</td>
                    <td>
                      <span
                        className={
                          s.multiplier > 1.3
                            ? 'badge-red'
                            : s.multiplier > 1
                              ? 'badge-amber'
                              : 'badge-coop'
                        }
                      >
                        {s.reason === 'no_supply'
                          ? 'No members free'
                          : s.multiplier > 1
                            ? 'High demand'
                            : 'Normal'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Async>
      </section>

      {/* --------------------------- workforce gaps -------------------------- */}
      <section>
        <SectionHeader
          title="Where to recruit and retrain"
          hint="Demand against verified supply, per trade. Highest pressure first."
        />

        <Async
          loading={gaps.loading}
          error={gaps.error}
          data={gaps.data}
          onRetry={gaps.reload}
          skeleton={<Skeleton className="h-72 rounded-xl" />}
          empty={<EmptyState icon={Users} title="No workforce data yet" />}
        >
          <div className="space-y-3">
            {(gaps.data ?? []).map((g) => {
              const meta = RECOMMENDATION_META[g.recommendation] ?? RECOMMENDATION_META.balanced;

              return (
                <article key={g.skillTag} className="card-pad">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-navy-900">{g.service}</h4>
                        <span className={meta.cls}>{meta.label}</span>
                      </div>
                      <p className="muted mt-1">{meta.body}</p>
                    </div>

                    {g.suggestedHires > 0 && (
                      <div className="shrink-0 rounded-lg bg-red-50 px-3.5 py-2 text-right">
                        <p className="tnum text-lg font-bold text-red-700">+{g.suggestedHires}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                          members needed
                        </p>
                      </div>
                    )}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-navy-100 pt-3.5 sm:grid-cols-5">
                    {[
                      { label: 'Bookings (30d)', value: num(g.bookings30d) },
                      { label: 'Revenue', value: inrCompact(g.revenue30d) },
                      { label: 'Verified members', value: `${g.online}/${g.workers} online` },
                      { label: 'Load per member', value: g.loadPerWorker },
                      { label: 'Went unmatched', value: pct(g.unmatchedRate) },
                    ].map((f) => (
                      <div key={f.label}>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                          {f.label}
                        </dt>
                        <dd className="tnum mt-0.5 text-sm font-bold text-navy-900">{f.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-3.5">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="font-semibold uppercase tracking-wide text-navy-400">
                        Supply pressure
                      </span>
                      <span className="tnum font-bold text-navy-700">{g.pressure}%</span>
                    </div>
                    <Progress
                      value={g.pressure}
                      tone={g.pressure > 60 ? 'red' : g.pressure > 35 ? 'saffron' : 'coop'}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </Async>
      </section>

      {/* ------------------------------- zones ------------------------------- */}
      <section className="card-pad">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="panel-title">Demand by zone</h3>
            <p className="muted mt-0.5">Where the work is, last 30 days.</p>
          </div>
          <button
            onClick={() => setShowTable((s) => !s)}
            className="btn-outline btn-sm"
            aria-pressed={showTable}
          >
            <Table2 size={13} /> {showTable ? 'Show bars' : 'Show table'}
          </button>
        </div>

        <Async
          loading={zones.loading}
          error={zones.error}
          data={zones.data}
          onRetry={zones.reload}
          skeleton={<Skeleton className="h-64 rounded-lg" />}
          empty={<EmptyState icon={MapPin} title="No zone data yet" />}
        >
          {showTable ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th className="text-right">Bookings</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Avg multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  {(zones.data ?? []).map((z) => (
                    <tr key={z.zone}>
                      <td className="font-medium">{z.zone}</td>
                      <td className="tnum text-right">{num(z.bookings)}</td>
                      <td className="tnum text-right">{inr(z.revenue)}</td>
                      <td className="tnum text-right">×{z.avgSurge.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Horizontal bars — zone names are long, so the labels get the x axis. */
            <div className="space-y-2.5">
              {(zones.data ?? []).map((z) => (
                <div key={z.zone} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs font-medium text-navy-700">
                    {z.zone}
                  </span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-navy-50">
                    <div
                      className="flex h-full items-center justify-end rounded-r px-2 transition-all"
                      style={{
                        width: `${Math.max(4, z.intensity)}%`,
                        background: sequentialStep(z.intensity / 100),
                      }}
                    >
                      <span className="tnum text-[10px] font-bold text-white">{z.bookings}</span>
                    </div>
                  </div>
                  <span className="tnum w-20 shrink-0 text-right text-xs font-semibold text-navy-700">
                    {inrCompact(z.revenue)}
                  </span>
                </div>
              ))}

              {/* Sequential ramp legend — one hue, light to dark. */}
              <div className="flex items-center gap-2 border-t border-navy-100 pt-3">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">
                  Fewer
                </span>
                <div className="flex h-2 flex-1 overflow-hidden rounded">
                  {SEQUENTIAL.map((c) => (
                    <span key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">
                  More bookings
                </span>
              </div>
            </div>
          )}
        </Async>
      </section>
    </div>
  );
}
