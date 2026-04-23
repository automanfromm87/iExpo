import { useState, useEffect, useCallback, useRef } from 'react';

interface DataState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

interface DataResult<T> extends DataState<T> {
  refetch: () => void;
}

const cache = new Map<string, { data: any; ts: number }>();

interface UseDataOptions {
  cacheTime?: number;
  enabled?: boolean;
}

export function useData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: UseDataOptions,
): DataResult<T> {
  const { cacheTime = 30000, enabled = true } = options ?? {};
  const [state, setState] = useState<DataState<T>>(() => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < cacheTime) {
      return { data: cached.data, loading: false, error: undefined };
    }
    return { data: undefined, loading: enabled, error: undefined };
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const version = useRef(0);

  const execute = useCallback(() => {
    const v = ++version.current;
    setState(prev => ({ ...prev, loading: true, error: undefined }));
    fetcherRef.current()
      .then(data => {
        if (v !== version.current) return;
        cache.set(key, { data, ts: Date.now() });
        setState({ data, loading: false, error: undefined });
      })
      .catch(error => {
        if (v !== version.current) return;
        setState(prev => ({ ...prev, loading: false, error }));
      });
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < cacheTime) {
      setState({ data: cached.data, loading: false, error: undefined });
      return;
    }
    execute();
  }, [key, enabled]);

  return { ...state, refetch: execute };
}
