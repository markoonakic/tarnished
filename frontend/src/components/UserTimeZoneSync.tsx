import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { getBrowserTimeZone } from '@/lib/api';
import { updatePreferences } from '@/lib/userPreferences';
import { useUserPreferences } from '@/hooks/useUserPreferences';

export default function UserTimeZoneSync() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const browserTimeZone = getBrowserTimeZone();
  const { data: preferences, isSuccess } = useUserPreferences({
    enabled: !loading && Boolean(user),
  });
  const syncedKeyRef = useRef<string | null>(null);

  const { mutate: syncTimeZone, isPending: isSyncPending } = useMutation({
    mutationFn: (timeZone: string) =>
      updatePreferences({ time_zone: timeZone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });

  useEffect(() => {
    if (loading || !user || !browserTimeZone || !isSuccess) {
      return;
    }

    if (preferences?.time_zone === browserTimeZone) {
      return;
    }

    const syncKey = `${user.id}:${browserTimeZone}`;
    if (syncedKeyRef.current === syncKey || isSyncPending) {
      return;
    }

    syncedKeyRef.current = syncKey;
    syncTimeZone(browserTimeZone);
  }, [
    browserTimeZone,
    isSuccess,
    isSyncPending,
    loading,
    preferences?.time_zone,
    syncTimeZone,
    user,
  ]);

  return null;
}
