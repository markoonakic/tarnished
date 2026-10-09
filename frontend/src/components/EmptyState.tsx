import HelpTip from './HelpTip';
import Button from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
interface Props {
  message: string;
  subMessage?: string;
  icon?: string; // Bootstrap Icon class (e.g., "bi-inbox")
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  message,
  subMessage,
  icon,
  action,
}: Props) {
  useTranslation();
  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-12 text-center"
      role="status"
      aria-label={message}
    >
      {icon && (
        <i className={`${icon} icon-2xl text-muted mb-4`} aria-hidden="true" />
      )}

      <p className="text-muted max-w-md text-sm leading-relaxed">{message}</p>

      {subMessage && <HelpTip label={message}>{subMessage}</HelpTip>}

      {action && (
        <Button variant="primary" onClick={action.onClick} className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  );
}
