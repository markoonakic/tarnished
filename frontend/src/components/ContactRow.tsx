import TextLink from '@/components/ui/TextLink';
import Button from '@/components/ui/Button';

import { useTranslation } from 'react-i18next';
import { pillStyle } from '@/lib/uiPills';
export default function ContactRow({
  name,
  href,
  role,
  roleColor = '--aqua-bright',
  subtitle,
  email,
  phone,
  lastContact,
  onUnlink,
}: {
  name: string;
  href?: string;
  role?: string;
  roleColor?: string;
  subtitle?: string;
  email?: string | null;
  phone?: string | null;
  lastContact?: string;
  onUnlink?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-tertiary flex flex-wrap items-center gap-3 rounded-lg px-4 py-3">
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <div className="flex flex-wrap items-center gap-2">
          {href ? (
            <TextLink to={href}>{name}</TextLink>
          ) : (
            <span className="text-fg1 text-sm font-medium">{name}</span>
          )}
        </div>
        {subtitle && <p className="text-fg4 text-xs">{subtitle}</p>}
      </div>
      {role && (
        <span
          className="inline-flex rounded px-2.5 py-1 text-xs font-semibold"
          style={pillStyle(roleColor)}
        >
          {role}
        </span>
      )}
      {lastContact && <span className="text-fg4 text-xs">{lastContact}</span>}
      <div className="text-muted flex gap-3">
        {email && (
          <TextLink
            href={`mailto:${email}`}
            aria-label={t('kit.emailContact', { name })}

            title={t('kit.emailContact', { name })}
          >
            <i className="bi bi-envelope" aria-hidden="true" />
          </TextLink>
        )}
        {phone && (
          <TextLink
            href={`tel:${phone}`}
            aria-label={t('kit.phoneContact', { name })}

            title={t('kit.phoneContact', { name })}
          >
            <i className="bi bi-telephone" aria-hidden="true" />
          </TextLink>
        )}
        {onUnlink && (
          <Button
            variant="icon"
            type="button"
            aria-label={t('kit.unlinkContact', { name })}
            title={t('kit.unlinkContact', { name })}
            onClick={onUnlink}
            className="flex items-center gap-1.5"
          >
            ×
          </Button>
        )}
      </div>
    </div>
  );
}
