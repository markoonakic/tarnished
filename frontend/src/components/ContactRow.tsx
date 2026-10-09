import { Link } from 'react-router-dom';
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
            <Link
              to={href}
              className="text-fg1 hover:text-accent-bright focus:ring-accent cursor-pointer font-medium transition-all duration-200 ease-in-out focus:ring-2"
            >
              {name}
            </Link>
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
          <a
            href={`mailto:${email}`}
            aria-label={t('kit.emailContact', { name })}
            className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
            title={t('kit.emailContact', { name })}
          >
            <i className="bi bi-envelope" aria-hidden="true" />
          </a>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            aria-label={t('kit.phoneContact', { name })}
            className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
            title={t('kit.phoneContact', { name })}
          >
            <i className="bi bi-telephone" aria-hidden="true" />
          </a>
        )}
        {onUnlink && (
          <button
            type="button"
            aria-label={t('kit.unlinkContact', { name })}
            title={t('kit.unlinkContact', { name })}
            onClick={onUnlink}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
