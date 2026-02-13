import { useToastContext } from '@/contexts/ToastContext';
import Toast from './Toast';

/**
 * Container component that renders all active toasts.
 * Should be placed near the root of the app.
 * Positions toasts in the top-right corner with proper stacking.
 */
export default function ToastContainer() {
  const { toasts, removeToast } = useToastContext();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}
