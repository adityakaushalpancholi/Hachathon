import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { workerPanel } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { Async, EmptyState } from '../../components/UI.jsx';
import ActiveJobCard from './ActiveJobCard.jsx';

/**
 * Deep link to one job. The worker dashboard already carries the full active-job
 * payload, so this reuses it rather than adding a separate per-job endpoint.
 */
export default function ActiveJob() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, loading, error, reload } = useApi(() => workerPanel.dashboard(), [], {
    pollMs: 10_000,
  });

  const job =
    data?.activeJob?._id === id
      ? data.activeJob
      : data?.upcoming?.find((j) => j._id === id) ?? data?.recent?.find((j) => j._id === id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button onClick={() => navigate(-1)} className="btn-ghost btn-sm -ml-2">
        <ChevronLeft size={15} /> Back
      </button>

      <Async loading={loading} error={error} data={data} onRetry={reload}>
        {job ? (
          <ActiveJobCard job={job} onChanged={() => reload({ silent: true })} />
        ) : (
          <EmptyState
            title="This job is not on your list"
            hint="It may have been reassigned, cancelled, or completed some time ago."
            action={
              <button onClick={() => navigate('/work')} className="btn-primary">
                Back to Today
              </button>
            }
          />
        )}
      </Async>
    </div>
  );
}
