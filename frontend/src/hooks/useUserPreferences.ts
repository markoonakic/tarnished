import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  DEFAULT_USER_PREFERENCES,
  getPreferences,
  updatePreferences,
  type UserPreferences,
  type UserPreferencesUpdate,
} from '@/lib/userPreferences';
import { useToast } from '@/hooks/useToast';

interface UseUserPreferencesOptions {
  enabled?: boolean;
}

interface UseUpdateUserPreferencesOptions {
  showErrorToast?: boolean;
  errorMessage?: string;
}

export const USER_PREFERENCES_QUERY_KEY = ['user-preferences'] as const;

function mergeUserPreferences(
  current: UserPreferences | undefined,
  updates: UserPreferencesUpdate
): UserPreferences {
  return {
    ...DEFAULT_USER_PREFERENCES,
    ...current,
    ...updates,
  };
}

export function useUserPreferences(options: UseUserPreferencesOptions = {}) {
  return useQuery({
    queryKey: USER_PREFERENCES_QUERY_KEY,
    queryFn: getPreferences,
    enabled: options.enabled ?? true,
  });
}

export function useUpdateUserPreferences(
  options: UseUpdateUserPreferencesOptions = {}
) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (updates: UserPreferencesUpdate) => updatePreferences(updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: USER_PREFERENCES_QUERY_KEY });

      const previousPreferences = queryClient.getQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY
      );

      queryClient.setQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY,
        mergeUserPreferences(previousPreferences, updates)
      );

      return { previousPreferences };
    },
    onError: (_error, _updates, context) => {
      if (context?.previousPreferences) {
        queryClient.setQueryData(
          USER_PREFERENCES_QUERY_KEY,
          context.previousPreferences
        );
      } else {
        queryClient.removeQueries({
          queryKey: USER_PREFERENCES_QUERY_KEY,
          exact: true,
        });
      }

      if (options.showErrorToast ?? true) {
        toast.error(options.errorMessage ?? 'Failed to update preferences');
      }
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, preferences);
    },
  });
}
