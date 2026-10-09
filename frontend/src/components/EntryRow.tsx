import Button from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import AiCheckbox from './AiCheckbox';
export default function EntryRow({
  title,
  subtitle,
  aiAllowed,
  aiDisabled,
  onAiChange,
  onEdit,
  onDelete,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aiAllowed?: boolean;
  aiDisabled?: boolean;
  onAiChange?: (allowed: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-tertiary flex items-center gap-4 rounded-lg px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-fg1 text-sm font-medium">{title}</p>
        {subtitle && <p className="text-fg4 text-xs">{subtitle}</p>}
      </div>
      {onAiChange && (
        <AiCheckbox
          checked={aiAllowed ?? true}
          disabled={aiDisabled}
          onChange={onAiChange}
        />
      )}
      <span className="text-muted flex gap-3">
        {onEdit && (
          <Button
            variant="icon"
            type="button"
            aria-label={t('kit.edit')}
            onClick={onEdit}

            title={t('kit.edit')}
          >
            <i className="bi bi-pencil" aria-hidden="true" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="icon"
            type="button"
            aria-label={t('kit.delete')}
            onClick={onDelete}

            title={t('kit.delete')}
          >
            <i className="bi bi-trash" aria-hidden="true" />
          </Button>
        )}
      </span>
    </div>
  );
}
