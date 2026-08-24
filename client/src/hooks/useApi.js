import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data fetching for a panel.
 *
 * Every panel loads from the API on mount, so this handles the three states the
 * UI actually has to render — loading, error, data — plus a `reload` for
 * mutations, and optional polling for the screens that track something live.
 *
 *   const { data, loading, error, reload } = useApi(() => bookings.dashboard(), []);
 */
export function useApi(fetcher, deps = [], { pollMs, enabled = true, initial = null } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  // Keep the latest fetcher without making it a dependency of the effect.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (mounted.current) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (err) {
      if (err.name !== 'AbortError' && mounted.current) setError(err);
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    run();

    if (!pollMs) return undefined;

    // Silent refreshes — polling must never flash a spinner over live content.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') run({ silent: true });
    }, pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, pollMs, enabled]);

  return { data, loading, error, reload: run, setData };
}

/** Wraps a mutating call with its own pending/error state. */
export function useMutation(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { mutate, pending, error };
}
