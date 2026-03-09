/**
 * useAsyncData Hook
 *
 * Manages async data loading with loading, error, and data states.
 * Eliminates duplicate data loading patterns across 12+ pages.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AsyncDataState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

export interface AsyncDataActions<T> {
  setData: (data: T | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  reload: () => Promise<void>;
  reset: () => void;
}

export interface UseAsyncDataOptions<T> {
  /**
   * Function to fetch data
   */
  fetchFn: () => Promise<T>;

  /**
   * Auto-load on mount
   * @default true
   */
  autoLoad?: boolean;

  /**
   * Dependencies array to trigger reload
   */
  deps?: React.DependencyList;

  /**
   * Callback on successful load
   */
  onSuccess?: (data: T) => void;

  /**
   * Callback on error
   */
  onError?: (error: Error) => void;

  /**
   * Initial data value
   * @default null
   */
  initialData?: T | null;
}

export type UseAsyncDataReturn<T> = AsyncDataState<T> & AsyncDataActions<T>;

/**
 * Hook for managing async data loading with loading/error states
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, reload } = useAsyncData({
 *   fetchFn: async () => {
 *     const response = await Space.list();
 *     return response;
 *   },
 *   onSuccess: (spaces) => {
 *     console.log('Loaded spaces:', spaces);
 *   }
 * });
 *
 * if (isLoading) return <Skeleton />;
 * if (error) return <Alert>{error}</Alert>;
 * return <div>{data?.length} spaces</div>;
 * ```
 */
export function useAsyncData<T>({
  fetchFn,
  autoLoad = true,
  deps = [],
  onSuccess,
  onError,
  initialData = null,
}: UseAsyncDataOptions<T>): UseAsyncDataReturn<T> {
  const [data, setDataState] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [error, setErrorState] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Store callbacks in refs to avoid stale closures and unnecessary re-renders
  const fetchFnRef = useRef(fetchFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  // Keep refs up to date
  fetchFnRef.current = fetchFn;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  // Load data - stable function that reads from refs
  const load = useCallback(async () => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setErrorState(null);

    try {
      const result = await fetchFnRef.current();

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setDataState(result);
        setIsLoading(false);
        onSuccessRef.current?.(result);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setErrorState(errorMessage);
        setIsLoading(false);
        onErrorRef.current?.(err instanceof Error ? err : new Error(errorMessage));
      }
    }
  }, []);

  // Public method to reload data
  const reload = useCallback(async () => {
    await load();
  }, [load]);

  // Reset state
  const reset = useCallback(() => {
    setDataState(initialData);
    setErrorState(null);
    setIsLoading(false);
  }, [initialData]);

  // Setters for manual control
  const setData = useCallback((newData: T | null) => {
    setDataState(newData);
  }, []);

  const setError = useCallback((newError: string | null) => {
    setErrorState(newError);
  }, []);

  // Auto-load on mount or when deps change
  useEffect(() => {
    if (autoLoad) {
      load();
    }

    return () => {
      // Abort any pending requests on unmount or deps change
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // load is stable (empty deps), so we can safely include it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, load, ...deps]);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    setData,
    setError,
    setIsLoading,
    reload,
    reset,
  };
}
