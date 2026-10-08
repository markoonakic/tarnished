import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useToastContext } from '@/contexts/ToastContext';
import Toast from './Toast';

export default function ToastContainer() {
  useTranslation();
  const { toasts, removeToast } = useToastContext();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
      aria-label={t('Notifications')}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}
