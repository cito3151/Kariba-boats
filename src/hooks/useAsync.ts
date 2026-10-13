import { useCallback, useEffect, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fn()
      .then((r) => { if (active) setData(r); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Something went wrong.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);
  return { data, loading, error, reload: run };
}

/**
 * A StatTile figure from a useAsync result: null until the query first answers,
 * so the tile holds a quiet bar and counts up when the real number arrives
 * instead of showing a made-up 0. A reload keeps the old figure (the tile counts
 * on from it) and a failed query shows 0.
 */
export function loadedFigure(data: unknown, loading: boolean, n: number): number | null {
  return data == null && loading ? null : n;
}
