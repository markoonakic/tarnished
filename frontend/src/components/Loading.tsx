import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import Spinner from './Spinner';

interface Props {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Loading({
  message = t('Loading...'),
  size = 'md',
}: Props) {
  useTranslation();
  return (
    <div
      className="flex flex-col items-center justify-center py-12"
      role="status"
      aria-live="polite"
    >
      <Spinner size={size} />
      <span className="text-fg1 mt-2 text-sm">{message}</span>
    </div>
  );
}
