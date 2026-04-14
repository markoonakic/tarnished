import { useQuery } from '@tanstack/react-query';

import { getPreferences } from '@/lib/userPreferences';

interface UseUserPreferencesOptions {
  enabled?: boolean;
}

export function useUserPreferences(options: UseUserPreferencesOptions = {}) {
  return useQuery({
    queryKey: ['user-preferences'],
    queryFn: getPreferences,
    enabled: options.enabled ?? true,
  });
}
