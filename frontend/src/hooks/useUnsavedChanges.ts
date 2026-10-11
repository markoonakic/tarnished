import { useEffect } from 'react';
import { registerExitGuard } from '@/lib/exitGuard';

/** Register a dirty form with the shared document, link and history exit guard. */
export function useUnsavedChanges(active: boolean) {
  useEffect(() => {
    if (active) return registerExitGuard();
  }, [active]);
}
