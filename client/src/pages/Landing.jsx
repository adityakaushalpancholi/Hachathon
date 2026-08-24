import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Users, Vote, PiggyBank, Zap, Search, TrendingUp,
} from 'lucide-react';
import { services as serviceApi, cooperatives as coopApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import ServiceCard from '../components/ServiceCard.jsx';
import { Skeleton } from '../components/UI.jsx';
import { inr, num } from '../lib/format.js';

/**
 * The commission comparison is the argument the whole product rests on, so it
 * is stated with real numbers rather than adjectives.
 */
const SPLIT_DEMO = { total: 599, coopCommission: 48, platformFee: 12 };

const PRINCIPLES = [
  {
    icon: Users,
    title: 'Members own it',
    body: 'Every worker on ShramSetu is a shareholding member of a registered cooperative — not a contractor on someone else’s platform.',
  },
  {
    icon: Vote,
    title: 'Members set the rules',
    body: 'Commission rate, the hourly rate floor and even the surge ceiling are voted on at the general body meeting, not set by a pricing team.',
  },
  {
    icon: PiggyBank,
    title: 'Members share the surplus',
    body: 'A fixed share of every rupee of commission goes back to members as a dividend, apportioned by the work they actually did.',
  },
  {
    icon: ShieldCheck,
    title: 'Members verify members',
    body: 'Documents and background checks are reviewed by the cooperative’s own board, who carry the reputational risk of admitting someone.',
  },
];

export default function Landing() {
  const { data: servicesData, loading } = useApi(() => serviceApi.list({ limit: 8 }), []);
  const { data: coops } = useApi(() => coopApi.list(), []);

  const items = servicesData ?? [];
  const totalMembers = (coops ?? []).reduce((s, c) => s + (c.stats?.memberCount ?? 0), 0);
  const totalJobs = (coops ?? []).reduce((s, c) => s + (c.stats?.jobsCompleted ?? 0), 0);
  const toWorkers = SPLIT_DEMO.total - SPLIT_DEMO.coopCommission - SPLIT_DEMO.platformFee;

  return (
    <>
      {/* -------------------------------- hero ------------------------------- */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #44c082 0, transparent 45%), radial-gradient(circle at 80% 60%, #ff9f37 0, transparent 40%)',
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="max-w-3xl">
            <span className="badge border border-coop-700/60 bg-coop-900/40 text-coop-300">
              <Users size={12} /> Cooperative owned · {num(totalMembers)} members
            </span>

            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              The people who do the work
              <span className="block text-coop-400">own the platform.</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-navy-200">
              Electricians, plumbers, cleaners and carpenters — verified by their own cooperative,
              paid a rate they voted for, and sharing the surplus their labour creates.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/browse" className="btn-coop px-5 py-3 text-base">
                <Search size={17} /> Find a service
              </Link>
              <Link to="/register" className="btn px-5 py-3 text-base text-white ring-1 ring-inset ring-navy-600 hover:bg-navy-900">
                Join as a member <ArrowRight size={17} />
              </Link>
            </div>

            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-navy-800 pt-7">
              {[
                { label: 'Verified members', value: num(totalMembers) },
                { label: 'Jobs completed', value: num(totalJobs) },
                { label: 'Goes to the worker', value: '90%' },
              ].map((s) => (
                <div key={s.label}>
                  <dd className="tnum text-2xl font-bold text-white sm:text-3xl">{s.value}</dd>
                  <dt className="mt-1 text-xs leading-tight text-navy-400">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ------------------------- the money argument ------------------------ */}
      <section className="border-b border-navy-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="badge-coop">Where your money goes</span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-navy-900">
                On a {inr(SPLIT_DEMO.total)} AC service, {inr(toWorkers)} reaches the technician.
              </h2>
              <p className="mt-4 leading-relaxed text-navy-600">
                Investor-owned marketplaces take 20–30% of every booking. A cooperative takes 8%,
                and 40% of even that comes back to members as a dividend. The difference is not
                charity — it is what happens when the surplus has no outside shareholder to reach.
              </p>

              <Link to="/browse" className="btn-primary mt-6">
                See the full breakdown on any service <ArrowRight size={15} />
              </Link>
            </div>

            {/* Stacked bar comparison — same booking, two ownership models. */}
            <div className="card-pad">
              <p className="text-sm font-bold text-navy-900">
                {inr(SPLIT_DEMO.total)} booking, two models
              </p>

              <div className="mt-6 space-y-6">
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-coop-700">
                      ShramSetu
                    </span>
                    <span className="tnum text-sm font-bold text-coop-700">
                      {inr(toWorkers)} to the worker
                    </span>
                  </div>
                  <div className="flex h-9 overflow-hidden rounded-lg">
                    <div className="flex items-center justify-center bg-coop-500 text-[11px] font-bold text-white" style={{ width: '90%' }}>
                      Worker 90%
                    </div>
                    <div className="flex items-center justify-center bg-navy-700 text-[10px] font-bold text-white" style={{ width: '8%' }}>
                      8%
                    </div>
                    <div className="bg-navy-300" style={{ width: '2%' }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-navy-500">
                    Worker · cooperative 8% (40% of it returned as dividend) · platform 2%
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-navy-500">
                      Typical investor-owned app
                    </span>
                    <span className="tnum text-sm font-bold text-navy-500">
                      {inr(Math.round(SPLIT_DEMO.total * 0.75))} to the worker
                    </span>
                  </div>
                  <div className="flex h-9 overflow-hidden rounded-lg">
                    <div className="flex items-center justify-center bg-navy-400 text-[11px] font-bold text-white" style={{ width: '75%' }}>
                      Worker 75%
                    </div>
                    <div className="flex items-center justify-center bg-saffron-500 text-[11px] font-bold text-white" style={{ width: '25%' }}>
                      Platform 25%
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-navy-500">
                    Commission leaves the local economy entirely.
                  </p>
                </div>
              </div>

              <p className="mt-6 border-t border-navy-100 pt-4 text-xs leading-relaxed text-navy-500">
                Figures from this prototype&rsquo;s live pricing engine. Every booking screen shows
                the same split before you confirm.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ services ----------------------------- */}
      <section className="bg-navy-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-navy-900">What we do</h2>
              <p className="muted mt-1.5">Fixed-price packages. No haggling at the door.</p>
            </div>
            <Link to="/browse" className="btn-outline">
              All services <ArrowRight size={15} />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-xl" />
                ))
              : items.map((s) => <ServiceCard key={s._id} service={s} />)}
          </div>
        </div>
      </section>

      {/* ----------------------------- principles ---------------------------- */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">
            What &ldquo;cooperative&rdquo; actually changes
          </h2>
          <p className="muted mt-2 max-w-2xl">
            Four structural differences, each of which shows up somewhere in this product.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="flex gap-4">
                <div className="h-fit shrink-0 rounded-xl bg-coop-100 p-3 text-coop-700">
                  <p.icon size={20} />
                </div>
                <div>
                  <h3 className="font-bold tracking-tight text-navy-900">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy-600">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------- how ------------------------------- */}
      <section className="border-t border-navy-100 bg-navy-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">How a booking works</h2>

          <ol className="mt-10 grid gap-8 md:grid-cols-4">
            {[
              { icon: Search, title: 'Pick a package', body: 'Fixed scope, fixed price, shown with the full payout split before you commit.' },
              { icon: Zap, title: 'We offer it out', body: 'The job goes to the nearest available members at once. First to accept takes it.' },
              { icon: ShieldCheck, title: 'Verify with a code', body: 'You read out a 4-digit code to start the job, and another to close it.' },
              { icon: TrendingUp, title: 'Everyone gets paid', body: 'The member is paid instantly; the cooperative’s share funds the dividend pool.' },
            ].map((step, i) => (
              <li key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <step.icon size={18} className="text-coop-600" />
                </div>
                <h3 className="mt-3 font-bold tracking-tight text-navy-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------- cta -------------------------------- */}
      <section className="bg-navy-900">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Skilled at a trade? Join a cooperative.
            </h2>
            <p className="mt-2 max-w-lg text-navy-300">
              Keep 90% of what you earn, vote on the rules, and share in the surplus.
            </p>
          </div>
          <Link to="/register" className="btn-coop shrink-0 px-5 py-3 text-base">
            Become a member <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}
