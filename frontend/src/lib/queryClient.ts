import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// Refresh saved data without starting feedback generation.
export function invalidateEvidenceQueries(client = queryClient) {
  void client.invalidateQueries({
    predicate: ({ queryKey }) =>
      /^(analytics-|dashboard-|applications$|application$|application-history$|statuses$|feedback$|streak$)/.test(
        String(queryKey[0])
      ),
  });
}
