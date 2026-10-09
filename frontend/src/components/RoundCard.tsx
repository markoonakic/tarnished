import { formatDateTime } from '@/lib/displayDate';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { roundTypeLabel } from '@/lib/referenceLabels';

import { getEffectiveTimeZone } from '@/lib/roundDateTime';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import type { Round } from '@/lib/types';
export default function RoundCard({
  round,
  onEdit,
  onDelete,
}: {
  round: Round;
  onEdit: () => void;
  onDelete: () => void;
  onMediaChange: () => void;
}) {
  const { t } = useTranslation();
  const preferences = useUserPreferences();
  const zone = preferences.data ? getEffectiveTimeZone(preferences.data) : null;
  const count = Object.values(round.preparation ?? {}).reduce(
    (sum, list) => sum + (list?.length ?? 0),
    0
  );
  return (
    <article id={`round-${round.id}`} className="bg-bg2 rounded-lg p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-primary font-medium">
            {roundTypeLabel(round.round_type)}
          </h4>
          <p className="text-muted mt-1 text-sm">
            {round.scheduled_at && zone
              ? formatDateTime(round.scheduled_at, zone)
              : '—'}{' '}
            <i
              className={`bi ${round.mode === 'video' ? 'bi-camera-video' : round.mode === 'phone' ? 'bi-telephone' : 'bi-geo-alt'} ml-2`}
              aria-hidden="true"
            />
          </p>
        </div>
        <span
          className={`rounded px-2 py-1 text-xs ${round.outcome === 'passed' ? 'bg-green-bright/10 text-green-bright' : round.outcome === 'failed' ? 'bg-red-bright/10 text-red-bright' : 'bg-orange-bright/10 text-orange-bright'}`}
        >
          ● {t('tasks.outcome.' + (round.outcome || 'pending'))}
        </span>
      </div>
      <div className="text-muted flex flex-wrap items-center justify-between gap-3 text-xs">
        <span>
          {t('tasks.participantsCount', {
            count: round.contact_ids?.length ?? 0,
          })}{' '}
          · {t('tasks.preparationCount', { count })}
          {round.media.length > 0 && (
            <i className="bi bi-mic ml-2" title={t('Recording')} />
          )}
        </span>
        <div className="flex items-center gap-3">
          <button
            aria-label={t('Edit round')}
            onClick={onEdit}
            className="hover:text-accent focus:ring-accent rounded p-1 focus:ring-2"
          >
            <i className="bi bi-pencil" />
          </button>
          <button
            aria-label={t('Delete round')}
            onClick={onDelete}
            className="text-red-bright focus:ring-accent rounded p-1 focus:ring-2"
          >
            <i className="bi bi-trash" />
          </button>
          <Link
            to={`/interviews/${round.id}`}
            className="text-accent focus:ring-accent rounded focus:ring-2"
          >
            {t('tasks.openInterview')} →
          </Link>
        </div>
      </div>
    </article>
  );
}
