import TextLink from '@/components/ui/TextLink';

import { useTranslation } from 'react-i18next';
import Card from '../Card';
import { dateLabel } from './addressBook';
import { pillStyle } from '@/lib/uiPills';
import { statusLabel, roundTypeLabel } from '@/lib/referenceLabels';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getStatusColor } from '@/lib/statusColors';
import type { ApplicationRecord, Lead, Interview } from '@/lib/apiV030';
export function RelatedApplications({
  items,
  withCompany = false,
}: {
  items: ApplicationRecord[];
  withCompany?: boolean;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <>
      {items.map((app) => (
        <TextLink
          key={app.id}
          to={'/applications/' + app.id}
          className="mb-2 flex flex-wrap items-center gap-3"
        >
          <span className="text-fg1 min-w-0 flex-1 basis-full text-sm sm:basis-auto">
            {withCompany ? app.company + ' — ' : ''}
            {app.job_title}
          </span>
          <span
            className="rounded px-2 py-1 text-xs font-semibold"
            style={{
              color: getStatusColor(app.status.name, colors, app.status.color),
              backgroundColor:
                getStatusColor(app.status.name, colors, app.status.color) +
                '20',
            }}
          >
            ● {statusLabel(app.status)}
          </span>
          <span className="text-muted text-xs">
            {dateLabel(app.applied_at)}
          </span>
        </TextLink>
      ))}
      {!items.length && (
        <p className="text-muted text-sm">{t('companies.noApplications')}</p>
      )}
    </>
  );
}
export function RelatedLeads({ items }: { items: Lead[] }) {
  const { t } = useTranslation();
  return (
    <Card
      title={t('companies.jobLeads')}
      icon="bi-bookmark"
      count={items.length}
    >
      {items.map((lead) => (
        <TextLink
          key={lead.id}
          to={'/job-leads/' + lead.id}
          className="mb-2 flex flex-wrap items-center gap-3"
        >
          <span className="text-fg1 min-w-0 flex-1 basis-full text-sm sm:basis-auto">
            {lead.title || t('companies.untitled')}
          </span>
          <span
            className="rounded px-2.5 py-1 text-xs font-semibold"
            style={pillStyle(
              lead.decision === 'interesting'
                ? '--yellow-bright'
                : lead.decision === 'rejected'
                  ? '--red-bright'
                  : '--gray'
            )}
          >
            {lead.decision
              ? t('companies.decision.' + lead.decision)
              : t('companies.notDecided')}
          </span>
          <span className="text-muted text-xs">
            {dateLabel(lead.scraped_at)}
          </span>
        </TextLink>
      ))}
      {!items.length && (
        <p className="text-muted text-sm">{t('companies.noLeads')}</p>
      )}
    </Card>
  );
}
export function RelatedInterviews({ items }: { items: Interview[] }) {
  const { t } = useTranslation();
  return (
    <>
      {items.map((round) => (
        <TextLink
          key={round.id}
          to={'/interviews/' + round.id}
          className="mb-2 flex flex-wrap items-center gap-3"
        >
          <span className="text-fg1 min-w-0 flex-1 basis-full text-sm sm:basis-auto">
            {roundTypeLabel(round.round_type)}
          </span>
          <span className="text-muted text-xs">
            {dateLabel(round.scheduled_at)}
          </span>
          <span
            className="rounded px-2.5 py-1 text-xs font-semibold"
            style={pillStyle(
              round.outcome === 'passed'
                ? '--aqua-bright'
                : round.outcome === 'failed'
                  ? '--red-bright'
                  : '--orange-bright'
            )}
          >
            {t('companies.outcome.' + (round.outcome || 'pending'))}
          </span>
        </TextLink>
      ))}
    </>
  );
}
