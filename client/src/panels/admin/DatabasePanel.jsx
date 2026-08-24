import { useCallback, useMemo, useState } from 'react';
import {
  Database,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  Server,
  HardDrive,
  KeyRound,
  Settings2,
  AlertTriangle,
} from 'lucide-react';
import { database } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { Async, EmptyState, Modal, SectionHeader, Spinner, StatCard } from '../../components/UI.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { num, formatDateTime } from '../../lib/format.js';

/**
 * The operator's view of the datastore.
 *
 * This is a reader, not an editor. The API exposes exactly one write — delete —
 * because editing arbitrary fields from a grid routes around every validator and
 * hook the models define, and a tool like that eventually corrupts the data it
 * was built to inspect. Everything else here is a window.
 *
 * Access is decided server-side against the deployment's owner list; the nav
 * entry that leads here is hidden for non-owners purely so nobody walks into a
 * 403.
 */

const PAGE_SIZE = 25;

/* ------------------------------ value rendering ---------------------------- */

const isObjectIdish = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);

/** One cell. Long structures collapse to a shape summary rather than a wall. */
function Cell({ value }) {
  if (value === null || value === undefined) return <span className="text-navy-300">—</span>;

  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'font-semibold text-coop-700' : 'text-navy-400'}>
        {value ? 'yes' : 'no'}
      </span>
    );
  }

  if (typeof value === 'number') return <span className="tnum font-mono">{num(value)}</span>;

  if (Array.isArray(value)) {
    return <span className="text-navy-400">[{value.length}]</span>;
  }

  if (typeof value === 'object') return <span className="text-navy-400">{'{…}'}</span>;

  const s = String(value);

  // An ISO timestamp is far more useful read as a date than as 24 characters.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return <span className="whitespace-nowrap text-navy-600">{formatDateTime(s)}</span>;
  }

  if (isObjectIdish(s)) {
    return <span className="tnum font-mono text-[11px] text-navy-400">{s.slice(-8)}</span>;
  }

  return <span className="text-navy-800">{s.length > 44 ? `${s.slice(0, 44)}…` : s}</span>;
}

/* --------------------------------- overview -------------------------------- */

function Connection({ connection, storage }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={Server}
        label="Database"
        value={connection.database}
        sub={connection.readyState}
        tone="navy"
      />
      <StatCard
        icon={Database}
        label="Host"
        value={connection.ephemeral ? 'In-memory' : 'Cluster'}
        sub={connection.host}
        tone={connection.ephemeral ? 'saffron' : 'coop'}
      />
      <StatCard
        icon={HardDrive}
        label="Data"
        value={storage ? `${storage.dataSizeMb} MB` : '—'}
        sub={storage ? `${num(storage.objects)} documents` : 'stats unavailable'}
        tone="navy"
      />
      <StatCard
        icon={KeyRound}
        label="Indexes"
        value={storage ? `${storage.indexSizeMb} MB` : '—'}
        sub={storage ? `${storage.storageSizeMb} MB allocated` : 'stats unavailable'}
        tone="navy"
      />
    </div>
  );
}

/* -------------------------------- the page --------------------------------- */

export default function DatabasePanel() {
  const [collection, setCollection] = useState(null);
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [inspecting, setInspecting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const toast = useToast();

  const overview = useApi(() => database.overview(), []);
  const rows = useApi(
    () => database.list(collection, { page, limit: PAGE_SIZE, q: query || undefined }),
    [collection, page, query],
    { enabled: Boolean(collection) },
  );
  const config = useApi(() => database.config(), [showConfig], { enabled: showConfig });

  const open = useCallback((name) => {
    setCollection(name);
    setPage(1);
    setTerm('');
    setQuery('');
  }, []);

  const search = (e) => {
    e.preventDefault();
    setPage(1);
    setQuery(term.trim());
  };

  /**
   * Columns are derived from the documents on screen rather than declared, so a
   * schema change shows up here without this file needing to hear about it.
   * `_id` leads; the noisiest bookkeeping fields are pushed to the end.
   */
  const columns = useMemo(() => {
    const docs = rows.data?.documents ?? [];
    if (!docs.length) return [];

    const seen = new Set();
    docs.forEach((d) => Object.keys(d).forEach((k) => seen.add(k)));

    const all = [...seen];
    const lead = ['_id', 'name', 'phone', 'role', 'code', 'status', 'label', 'title'];
    const trail = ['createdAt', 'updatedAt'];

    return [
      ...lead.filter((k) => all.includes(k)),
      ...all.filter((k) => !lead.includes(k) && !trail.includes(k)),
      ...trail.filter((k) => all.includes(k)),
    ].slice(0, 9);
  }, [rows.data]);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await database.remove(collection, confirmDelete._id);
      toast.success('Document deleted');
      setConfirmDelete(null);
      setInspecting(null);
      rows.reload({ silent: true });
      overview.reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const active = overview.data?.collections?.find((c) => c.model === collection);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Database"
        hint="Every collection as it is actually stored. Read-only, apart from deleting a document."
        action={
          <button onClick={() => setShowConfig(true)} className="btn-ghost">
            <Settings2 size={15} /> Runtime config
          </button>
        }
      />

      <Async
        loading={overview.loading}
        error={overview.error}
        data={overview.data}
        onRetry={overview.reload}
      >
        {overview.data && (
          <div className="space-y-6">
            <Connection connection={overview.data.connection} storage={overview.data.storage} />

            {overview.data.connection.ephemeral && (
              <div className="flex items-start gap-2.5 rounded-xl border border-saffron-200 bg-saffron-50 p-4 text-sm text-navy-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-saffron-600" />
                <p>
                  This deployment is running on an <strong>in-memory database</strong>. Everything
                  below is discarded when the process restarts. Set{' '}
                  <code className="font-mono text-navy-700">MONGO_URI</code> to a real cluster to
                  persist it.
                </p>
              </div>
            )}

            {/* ------------------------- collection list ------------------------ */}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {overview.data.collections.map((c) => (
                <button
                  key={c.model}
                  onClick={() => open(c.model)}
                  className={`rounded-xl border bg-white p-4 text-left transition hover:shadow-card ${
                    collection === c.model
                      ? 'border-navy-900 ring-1 ring-navy-900'
                      : 'border-navy-100 hover:border-navy-300'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-navy-900">{c.label}</p>
                    <p className="tnum font-mono text-sm font-bold text-navy-900">{num(c.count)}</p>
                  </div>
                  <p className="muted mt-0.5 truncate text-xs">{c.hint}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </Async>

      {/* ---------------------------- document table ---------------------------- */}
      {collection && (
        <div className="rounded-2xl border border-navy-100 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-navy-100 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-navy-900">{active?.label ?? collection}</p>
              <p className="muted text-xs">
                {rows.data ? `${num(rows.data.total)} documents` : 'loading…'}
                {query && ` matching “${query}”`}
              </p>
            </div>

            <form onSubmit={search} className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
              />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search text fields or paste an id"
                className="input h-9 w-full pl-9 sm:w-72"
              />
            </form>

            <button
              onClick={() => setCollection(null)}
              className="btn-ghost p-2"
              aria-label="Close collection"
            >
              <X size={16} />
            </button>
          </div>

          <Async {...rows} onRetry={rows.reload}>
            {rows.data?.documents.length === 0 ? (
              <EmptyState
                icon={Database}
                title="Nothing here"
                hint={query ? 'No document matches that search.' : 'This collection is empty.'}
              />
            ) : (
              rows.data && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-navy-100 text-left">
                          {columns.map((c) => (
                            <th
                              key={c}
                              className="whitespace-nowrap px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-navy-400"
                            >
                              {c}
                            </th>
                          ))}
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.data.documents.map((d) => (
                          <tr
                            key={d._id}
                            onClick={() => setInspecting(d)}
                            className="cursor-pointer border-b border-navy-50 transition last:border-0 hover:bg-navy-50/70"
                          >
                            {columns.map((c) => (
                              <td key={c} className="max-w-[18rem] truncate px-4 py-2.5">
                                <Cell value={d[c]} />
                              </td>
                            ))}
                            <td className="px-2 text-navy-300">
                              <ChevronRight size={15} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {rows.data.pages > 1 && (
                    <div className="flex items-center justify-between border-t border-navy-100 p-3">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={rows.data.page <= 1}
                        className="btn-ghost disabled:opacity-40"
                      >
                        <ChevronLeft size={15} /> Previous
                      </button>
                      <p className="tnum muted text-xs">
                        Page {rows.data.page} of {rows.data.pages}
                      </p>
                      <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={rows.data.page >= rows.data.pages}
                        className="btn-ghost disabled:opacity-40"
                      >
                        Next <ChevronRight size={15} />
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </Async>
        </div>
      )}

      {/* ------------------------------ inspector ------------------------------ */}
      <Modal
        open={Boolean(inspecting)}
        onClose={() => setInspecting(null)}
        title={`${active?.label ?? collection} · document`}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <button
              onClick={() => setConfirmDelete(inspecting)}
              className="btn-ghost text-red-600 hover:bg-red-50"
            >
              <Trash2 size={15} /> Delete
            </button>
            <button onClick={() => setInspecting(null)} className="btn-primary">
              Close
            </button>
          </div>
        }
      >
        {inspecting && (
          <pre className="max-h-[55vh] overflow-auto rounded-lg bg-navy-950 p-4 text-xs leading-relaxed text-navy-100">
            {JSON.stringify(inspecting, null, 2)}
          </pre>
        )}
      </Modal>

      {/* ---------------------------- delete confirm --------------------------- */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete this document?"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={doDelete} disabled={deleting} className="btn-danger">
              {deleting ? <Spinner size={15} /> : <Trash2 size={15} />} Delete permanently
            </button>
          </div>
        }
      >
        <p className="text-sm text-navy-700">
          This removes the document from{' '}
          <strong>{active?.label ?? collection}</strong> immediately. Nothing here cascades — related
          documents in other collections are left pointing at an id that no longer resolves.
        </p>
        {confirmDelete && (
          <p className="tnum mt-3 rounded-lg bg-navy-50 p-3 font-mono text-xs text-navy-600">
            {confirmDelete._id}
          </p>
        )}
      </Modal>

      {/* ----------------------------- runtime config -------------------------- */}
      <Modal
        open={showConfig}
        onClose={() => setShowConfig(false)}
        title="Runtime configuration"
        size="lg"
        footer={
          <button onClick={() => setShowConfig(false)} className="btn-primary ml-auto">
            Close
          </button>
        }
      >
        <p className="muted mb-3 text-xs">
          What this process actually booted with. Secrets appear only as whether they are set.
        </p>
        <Async {...config} onRetry={config.reload}>
          {config.data && (
            <pre className="max-h-[55vh] overflow-auto rounded-lg bg-navy-950 p-4 text-xs leading-relaxed text-navy-100">
              {JSON.stringify(config.data, null, 2)}
            </pre>
          )}
        </Async>
      </Modal>
    </div>
  );
}
