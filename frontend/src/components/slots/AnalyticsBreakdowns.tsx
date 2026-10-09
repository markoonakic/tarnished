import Button from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import Card from '@/components/Card';
import HelpTip from '@/components/HelpTip';
import { locale } from '@/lib/i18n';
import type { Frequency } from '@/lib/apiV030';
import {
  useAnalyticsBreakdowns,
  type AnalyticsSlotProps,
} from '@/hooks/useAnalyticsBreakdowns';

function Frequencies({
  title,
  icon,
  items,
}: {
  title: string;
  icon: string;
  items: Frequency[];
}) {
  const { t } = useTranslation();
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return (
    <Card title={title} icon={icon} className="mb-0! min-w-0">
      {items.length === 0 ? (
        <p className="text-muted text-sm">{t('analytics.noData')}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.label}
              className="grid grid-cols-[minmax(0,1fr)_3ch] items-center gap-x-3 gap-y-2 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_3ch]"
            >
              <span
                className="text-fg1 col-span-2 sm:col-span-1 sm:truncate"
                title={item.label}
              >
                {item.label}
              </span>
              <span
                className="bg-bg3 h-2 overflow-hidden rounded-full"
                aria-hidden="true"
              >
                <span
                  className="bg-accent block h-full rounded-full"
                  style={{ width: `${(item.count / maximum) * 100}%` }}
                />
              </span>
              <span className="text-muted text-right">
                {item.count.toLocaleString(locale())}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const columns = [
  'sent',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export default function AnalyticsBreakdowns(props: AnalyticsSlotProps) {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useAnalyticsBreakdowns(props);
  if (isPending)
    return (
      <p className="text-muted" role="status">
        {t('analytics.loading')}
      </p>
    );
  if (isError || !data)
    return (
      <Card title={t('analytics.bySource')} icon="bi-signpost-split">
        <p className="text-red-bright" role="alert">
          {t('analytics.loadError')}
        </p>
        <Button
          type="button"
          className="mt-2 flex items-center gap-1.5"
          onClick={() => void refetch()}
        >
          <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
          {t('analytics.retry')}
        </Button>
      </Card>
    );
  return (
    <div className="mb-6 grid gap-6">
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            {t('analytics.bySource')}{' '}
            <HelpTip label={t('analytics.bySource')}>
              {t('analytics.sourceHint')}
            </HelpTip>
          </span>
        }
        icon="bi-signpost-split"
        className="mb-0!"
      >
        {data.outcomes_by_source.length === 0 ? (
          <p className="text-muted text-sm">{t('analytics.noData')}</p>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-lg md:block">
              <table className="bg-bg2 w-full text-left text-sm">
                <caption className="sr-only">{t('analytics.bySource')}</caption>
                <thead className="text-muted text-xs uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      {t('analytics.source')}
                    </th>
                    {columns.map((column) => (
                      <th key={column} scope="col" className="px-4 py-3">
                        {t(`analytics.${column}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.outcomes_by_source.map((row) => (
                    <tr
                      key={row.source ?? ''}
                      className="border-muted/30 border-t"
                    >
                      <th
                        scope="row"
                        className="text-fg1 px-4 py-3 font-normal"
                      >
                        {row.source || t('analytics.unknownSource')}
                      </th>
                      {columns.map((column) => (
                        <td key={column} className="text-muted px-4 py-3">
                          {row[column].toLocaleString(locale())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {data.outcomes_by_source.map((row) => (
                <li key={row.source ?? ''} className="bg-bg2 rounded-lg p-4">
                  <h4 className="text-fg1 mb-3 font-medium">
                    {row.source || t('analytics.unknownSource')}
                  </h4>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {columns.map((column) => (
                      <div key={column} className="flex justify-between gap-2">
                        <dt className="text-muted">
                          {t(`analytics.${column}`)}
                        </dt>
                        <dd className="text-fg1">
                          {row[column].toLocaleString(locale())}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Frequencies
          title={t('analytics.topPositions')}
          icon="bi-briefcase"
          items={data.top_positions.slice(0, 5)}
        />
        <Frequencies
          title={t('analytics.topTechnologies')}
          icon="bi-cpu"
          items={data.top_technologies.slice(0, 5)}
        />
      </div>
    </div>
  );
}
