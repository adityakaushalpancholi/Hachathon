import { useEffect, useState } from 'react';

/**
 * Delays a rapidly-changing value (a search box) so dependent effects fire once
 * the user pauses, rather than on every keystroke.
 */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
