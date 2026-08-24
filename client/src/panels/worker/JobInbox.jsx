import { Inbox, Power } from 'lucide-react';
import { workerPanel } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { Async, SectionHeader, EmptyState, Skeleton } from '../../components/UI.jsx';
import OfferCard from './OfferCard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function JobInbox() {
  const { workerProfile } = useAuth();

  // Offers are time-boxed, so this is the fastest poll in the app.
  const { data, loading, error, reload } = useApi(() => workerPanel.offers(), [], {
    pollMs: 5000,
    initial: [],
  });

  const offers = data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeader
        title="Job offers"
        hint="Each offer is sitting in several members' inboxes at once. First to accept takes it."
      />

      <Async
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        skeleton={
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        }
      >
        {offers.length === 0 ? (
          <EmptyState
            icon={workerProfile?.availability?.isOnline ? Inbox : Power}
            title={workerProfile?.availability?.isOnline ? 'No live offers' : 'You are offline'}
            hint={
              workerProfile?.availability?.isOnline
                ? 'This list refreshes every few seconds. New jobs near you will show up here automatically.'
                : 'Go online from the Today screen to start receiving offers.'
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {offers.map((o) => (
              <OfferCard key={o._id} offer={o} onChanged={() => reload({ silent: true })} />
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}
