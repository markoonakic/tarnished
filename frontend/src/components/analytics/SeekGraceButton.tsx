import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
interface SeekGraceButtonProps {
  onSeekGrace: () => Promise<void>;
  loading: boolean;
  disabled?: boolean;
  label?: string;
}

export function SeekGraceButton({
  onSeekGrace,
  loading,
  disabled = false,
  label = t('Seek Grace'),
}: SeekGraceButtonProps) {
  useTranslation();
  if (loading) return null;
  return (
    <Button
      variant="primary"
      onClick={onSeekGrace}
      disabled={disabled}
      className="flex items-center gap-2"
    >
      <i className="bi-sun icon-sm" aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}
