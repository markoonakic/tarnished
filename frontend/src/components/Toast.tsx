import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Toast as ToastType } from '@/contexts/ToastContext';

interface Props {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

const toastConfig = {
  success: {
    icon: 'bi-check-circle-fill',
    iconColor: 'text-green-bright',
    bgClass: 'bg-bg3',
  },
  error: {
    icon: 'bi-x-circle-fill',
    iconColor: 'text-red-bright',
    bgClass: 'bg-bg3',
  },
  warning: {
    icon: 'bi-exclamation-triangle-fill',
    iconColor: 'text-orange-bright',
    bgClass: 'bg-bg3',
  },
  info: {
    icon: 'bi-info-circle-fill',
    iconColor: 'text-blue-bright',
    bgClass: 'bg-bg3',
  },
};

export default function Toast({ toast, onDismiss }: Props) {
  useTranslation();
  const config = toastConfig[toast.type];

  return (
    <div
      className={`${config.bgClass} flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg transition-all duration-200 ease-in-out`}
      role="alert"
    >
      <i
        className={`bi ${config.icon} ${config.iconColor} icon-md mt-0.5 flex-shrink-0`}
      />
      <div className="text-fg1 flex-1 text-sm">
        <p>{toast.message}</p>
        {toast.action && (
          <Link
            to={toast.action.to}
            onClick={() => onDismiss(toast.id)}
            className="text-accent hover:text-accent-bright mt-1 inline-block underline"
          >
            {toast.action.label}
          </Link>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-fg4 hover:text-fg1 flex-shrink-0 cursor-pointer transition-colors duration-200 ease-in-out"
        aria-label={t('Dismiss notification')}
      >
        <i className="bi-x-lg icon-sm" />
      </button>
    </div>
  );
}
