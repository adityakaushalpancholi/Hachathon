import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { notifications as api } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { relativeTime } from '../lib/format.js';
import { EmptyState } from './UI.jsx';

const TYPE_DOT = {
  job_offer: 'bg-saffron-500',
  booking_update: 'bg-navy-500',
  payment: 'bg-coop-500',
  payout: 'bg-coop-500',
  verification: 'bg-navy-500',
  sos: 'bg-red-500',
  system: 'bg-navy-300',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Polls in the background; the inbox is the app's only push channel today.
  const { data, reload } = useApi(() => api.list(), [], { pollMs: 20_000, initial: [] });

  const items = data ?? [];
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markAll = async () => {
    await api.markAllRead();
    reload({ silent: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-navy-500 transition hover:bg-navy-100 hover:text-navy-900"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-saffron-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-fade-up overflow-hidden rounded-xl border border-navy-100 bg-white shadow-lift">
          <header className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
            <p className="text-sm font-semibold text-navy-900">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="btn-ghost btn-sm gap-1.5">
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </header>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Bell} title="Nothing yet" hint="Updates will appear here." />
              </div>
            ) : (
              items.map((n) => (
                <article
                  key={n._id}
                  className={`flex gap-3 border-b border-navy-50 px-4 py-3 last:border-0 ${
                    n.read ? 'bg-white' : 'bg-coop-50/40'
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[n.type] ?? 'bg-navy-300'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-navy-900">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs leading-snug text-navy-500">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-navy-400">{relativeTime(n.createdAt)}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
