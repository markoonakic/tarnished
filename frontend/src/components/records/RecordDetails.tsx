import { useEffectiveDayKey } from '@/hooks/useEffectiveDayKey';
import { useTranslation } from 'react-i18next';
import { locale } from '@/lib/i18n';
import type { JobFields } from '@/lib/apiV030';
import DeadlineReminder from './DeadlineReminder';

export default function RecordDetails({
  record,
  type,
  title,
  onUpdated,
}: {
  record: JobFields & {
    id: string;
    posted_date?: string | null;
    salary_min?: number | null;
    salary_max?: number | null;
    salary_currency?: string | null;
  };
  type: 'lead' | 'application';
  title: string;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const date = (value?: string | null) =>
    value
      ? new Date(value).toLocaleDateString(locale(), { timeZone: 'UTC' })
      : '—';
  const today = useEffectiveDayKey();
  const days = record.deadline
    ? Math.round((Date.parse(record.deadline) - Date.parse(today)) / 86400000)
    : null;
  const urgent = days !== null && days <= 3;
  const deadlineLabel = record.deadline
    ? `${date(record.deadline)} · ${days! < 0 ? t('kit.overdue') + ' · ' : ''}${new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(days!, 'day')}`
    : '—';
  const pay =
    record.salary_min != null || record.salary_max != null
      ? `${record.salary_min?.toLocaleString(locale()) ?? '—'}–${record.salary_max?.toLocaleString(locale()) ?? '—'} ${record.salary_currency || ''}${record.pay_period ? ' / ' + t('records.' + record.pay_period) : ''}`
      : '—';
  const values = [
    ['work_mode', record.work_mode ? t('records.' + record.work_mode) : '—'],
    [
      'employment_type',
      record.employment_type ? t('records.' + record.employment_type) : '—',
    ],
    ['seniority', record.seniority || '—'],
    ['pay', pay],
  ];
  if (type === 'application')
    return (
      <dl className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div className="flex items-center">
          <dt className="text-muted mr-2">{t('records.deadline')}:</dt>
          <dd
            className={urgent ? 'text-red-bright font-medium' : 'text-primary'}
          >
            {deadlineLabel}
            {record.deadline && (
              <DeadlineReminder
                id={record.id}
                type={type}
                title={title}
                deadline={record.deadline}
                onUpdated={onUpdated}
              />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted mr-2 inline">{t('records.pay')}:</dt>
          <dd className="text-primary inline">{pay}</dd>
        </div>
      </dl>
    );
  return (
    <section className="bg-bg2 mb-4 rounded-lg p-4">
      <h3 className="text-muted mb-3 flex items-center gap-2 text-sm">
        <i className="bi-list-ul" aria-hidden="true" />
        {t('records.details')}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        {values.map(([key, value]) => (
          <div key={key}>
            <dt className="text-muted mb-1 text-xs">{t('records.' + key)}</dt>
            <dd className="text-primary">{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-muted mb-1 text-xs">{t('records.posted')}</dt>
          <dd>{date(record.posted_date)}</dd>
        </div>
        <div>
          <dt className="text-muted mb-1 text-xs">{t('records.deadline')}</dt>
          <dd
            className={urgent ? 'text-red-bright font-medium' : 'text-primary'}
          >
            {deadlineLabel}
            {record.deadline && (
              <DeadlineReminder
                id={record.id}
                type={type}
                title={title}
                deadline={record.deadline}
                onUpdated={onUpdated}
              />
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
