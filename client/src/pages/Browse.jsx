import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Users, Grid3x3 } from 'lucide-react';
import { services as serviceApi, workers as workerApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import ServiceCard from '../components/ServiceCard.jsx';
import WorkerCard from '../components/WorkerCard.jsx';
import { Async, ChipRow, EmptyState, Skeleton, SectionHeader } from '../components/UI.jsx';
import { useDebounced } from '../hooks/useDebounced.js';

const SORTS = [
  { value: 'rating', label: 'Top rated' },
  { value: 'experience', label: 'Most experienced' },
  { value: 'jobs', label: 'Most jobs' },
  { value: 'rate_asc', label: 'Lowest rate' },
  { value: 'rate_desc', label: 'Highest rate' },
];

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'members' ? 'members' : 'services';

  const [q, setQ] = useState('');
  const [category, setCategory] = useState(null);
  const [skillTag, setSkillTag] = useState(null);
  const [sort, setSort] = useState('rating');

  // The search box drives a network request; debounce so typing does not
  // fire a query per keystroke.
  const query = useDebounced(q, 350);

  const { data: categories } = useApi(() => serviceApi.categories(), []);

  const servicesState = useApi(
    () => serviceApi.list({ q: query || undefined, category: category || undefined, limit: 24 }),
    [query, category],
    { enabled: view === 'services' },
  );

  const workersState = useApi(
    () => workerApi.list({ q: query || undefined, skillTag: skillTag || undefined, sort, limit: 24 }),
    [query, skillTag, sort],
    { enabled: view === 'members' },
  );

  const setView = (v) => {
    setParams(v === 'members' ? { view: 'members' } : {});
    setQ('');
  };

  const state = view === 'services' ? servicesState : workersState;

  // Skill filter options are derived from the catalogue, so they never drift
  // from what actually exists.
  const { data: allServices } = useApi(() => serviceApi.list({ limit: 50 }), []);
  const skillOptions = (allServices ?? []).map((s) => ({ value: s.skillTag, label: s.name }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeader
        title={view === 'services' ? 'Services' : 'Our members'}
        hint={
          view === 'services'
            ? 'Fixed-price packages delivered by verified cooperative members.'
            : 'Every member here has been verified by their own cooperative board.'
        }
        action={
          <div className="flex rounded-lg border border-navy-200 bg-white p-0.5">
            {[
              { key: 'services', label: 'Services', icon: Grid3x3 },
              { key: 'members', label: 'Members', icon: Users },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  view === t.key ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-navy-50'
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        }
      />

      {/* ------------------------------ filters ----------------------------- */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={view === 'services' ? 'Search services…' : 'Search members by name or area…'}
              className="input pl-10"
              aria-label="Search"
            />
          </div>

          {view === 'members' && (
            <div className="relative sm:w-52">
              <SlidersHorizontal
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="select pl-9"
                aria-label="Sort by"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {view === 'services' ? (
          <ChipRow
            options={(categories ?? []).map((c) => ({ value: c.category, label: c.category }))}
            value={category}
            onChange={setCategory}
            allLabel="All categories"
          />
        ) : (
          <ChipRow options={skillOptions} value={skillTag} onChange={setSkillTag} allLabel="All trades" />
        )}
      </div>

      {/* ------------------------------ results ----------------------------- */}
      <Async
        loading={state.loading}
        error={state.error}
        data={state.data}
        onRetry={state.reload}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        }
        empty={
          <EmptyState
            icon={Search}
            title="Nothing matched"
            hint="Try a different search term, or clear the filters."
          />
        }
      >
        <>
          <p className="muted mb-3">
            {state.data?.meta?.total ?? state.data?.length ?? 0}{' '}
            {view === 'services' ? 'services' : 'members'}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {view === 'services'
              ? (state.data ?? []).map((s) => <ServiceCard key={s._id} service={s} />)
              : (state.data ?? []).map((w) => <WorkerCard key={w._id} worker={w} />)}
          </div>
        </>
      </Async>
    </div>
  );
}
