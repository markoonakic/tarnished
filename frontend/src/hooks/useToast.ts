import { useToastContext } from '@/contexts/ToastContext';

/**
 * Hook to display toast notifications.
 *
 * @example
 * ```tsx
 * const toast = useToast();
 *
 * toast.success('Saved successfully!');
 * toast.error('Failed to save');
 * toast.warning('This action cannot be undone');
 * toast.info('New updates available');
 * ```
 */
export function useToast() {
  return useToastContext();
}
