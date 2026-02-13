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
  const config = toastConfig[toast.type];

  return (
    <div
      className={`${config.bgClass} rounded-lg px-4 py-3 flex items-start gap-3 shadow-lg transition-all duration-200 ease-in-out`}
      role="alert"
    >
      <i className={`bi ${config.icon} ${config.iconColor} icon-md flex-shrink-0 mt-0.5`} />
      <p className="text-fg1 text-sm flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-fg4 hover:text-fg1 transition-colors duration-200 ease-in-out cursor-pointer flex-shrink-0"
        aria-label="Dismiss notification"
      >
        <i className="bi-x-lg icon-sm" />
      </button>
    </div>
  );
}
