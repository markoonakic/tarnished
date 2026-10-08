import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { pillStyle } from '@/lib/uiPills';
export default function ContactRow({
  name,
  href,
  role,
  subtitle,
  email,
  phone,
  lastContact,
  onUnlink,
}: {
  name: string;
  href?: string;
  role?: string;
  subtitle?: string;
  email?: string | null;
  phone?: string | null;
  lastContact?: string;
  onUnlink?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-tertiary flex items-center gap-3 rounded-lg px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {href ? (
            <Link
              to={href}
              className="text-fg1 hover:text-accent text-sm font-medium"
            >
              {name}
            </Link>
          ) : (
            <span className="text-fg1 text-sm font-medium">{name}</span>
          )}
          {role && (
            <span
              className="inline-flex rounded px-2.5 py-1 text-xs font-semibold"
              style={pillStyle('--blue-bright')}
            >
              {role}
            </span>
          )}
        </div>
        {subtitle && <p className="text-fg4 text-xs">{subtitle}</p>}
        {lastContact && <p className="text-fg4 mt-1 text-xs">{lastContact}</p>}
      </div>
      <div className="text-accent flex gap-3">
        {email && (
          <a
            href={`mailto:${email}`}
            aria-label={t('kit.emailContact', { name })}
            className="focus:ring-accent rounded focus:ring-2"
          >
            <i className="bi bi-envelope" aria-hidden="true" />
          </a>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            aria-label={t('kit.phoneContact', { name })}
            className="focus:ring-accent rounded focus:ring-2"
          >
            <i className="bi bi-telephone" aria-hidden="true" />
          </a>
        )}
        {onUnlink && (
          <button
            type="button"
            aria-label={t('kit.unlinkContact', { name })}
            onClick={onUnlink}
            className="text-muted focus:ring-accent cursor-pointer rounded focus:ring-2"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
