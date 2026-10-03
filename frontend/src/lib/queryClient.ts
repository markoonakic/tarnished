import {
  focusManager,
  QueryClient,
  QueryObserver,
} from '@tanstack/react-query';
import {
  recoverReadInterval,
  refetchRead,
  retryRead,
  readRetryDelay,
} from './readRecovery';

// Query v5 listens to visibility changes, but a visible window can regain focus too.
focusManager.setEventListener((onFocus) => {
  const update = () => onFocus();
  window.addEventListener('focus', update);
  document.addEventListener('visibilitychange', update);
  return () => {
    window.removeEventListener('focus', update);
    document.removeEventListener('visibilitychange', update);
  };
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: retryRead,
      retryDelay: readRetryDelay,
      refetchOnWindowFocus: refetchRead,
      refetchOnReconnect: refetchRead,
      refetchInterval: recoverReadInterval,
    },
    mutations: { retry: false },
  },
});

let readId = 0;

/** Observe a GET-only effect with the same policy as useQuery.
 * Loaders keep their local UI state and return { error } on failure, so direct
 * manual calls still settle safely. Cleanup stops retries and drops the cache.
 * Use staleTime: Infinity for editable drafts: recover errors, never replace edits.
 */
export function observeRead(
  load: () => Promise<void | { error: unknown }>,
  options: { staleTime?: number; refetchInterval?: () => number | false } = {}
): () => void {
  const queryKey = ['read-effect', ++readId];
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn: async () => {
      const result = await load();
      if (result) throw result.error;
      return null;
    },
    gcTime: 0,
    ...(options.staleTime !== undefined
      ? { staleTime: options.staleTime }
      : {}),
    refetchInterval: (query) =>
      query.state.status === 'error'
        ? recoverReadInterval(query)
        : options.refetchInterval?.() || false,
  });
  queryClient.mount();
  const unsubscribe = observer.subscribe(() => {});
  return () => {
    unsubscribe();
    queryClient.removeQueries({ queryKey, exact: true });
    queryClient.unmount();
  };
}

// Refresh saved data without starting feedback generation.
export function invalidateEvidenceQueries(client = queryClient) {
  void client.invalidateQueries({
    predicate: ({ queryKey }) =>
      /^(analytics-|dashboard-|applications$|application$|application-history$|statuses$|feedback$|streak$)/.test(
        String(queryKey[0])
      ),
  });
}
