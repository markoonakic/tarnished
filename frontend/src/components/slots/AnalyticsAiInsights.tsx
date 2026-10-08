import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '@/components/Card';
import { apiV030, type AnalyticsQuery, type Breakdown } from '@/lib/apiV030';

export default function AnalyticsAiInsights({
  period,
  asOf,
}: {
  period: string;
  asOf?: string;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let active = true;
    setError(false);
    setData(null);
    void apiV030
      .breakdowns({ period: period as AnalyticsQuery['period'], as_of: asOf })
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [period, asOf]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {(['repeated_requirements', 'missing_evidence'] as const).map((kind) => {
        const table = data?.[kind];
        const rows = table?.items ?? [];
        const shown = expanded[kind] ? rows : rows.slice(0, 5);
        const max = Math.max(1, ...rows.map((row) => row.count));
        return (
          <Card
            key={kind}
            title={t(`ai.${kind}`)}
            icon={
              kind === 'repeated_requirements'
                ? 'bi-arrow-repeat'
                : 'bi-question-diamond'
            }
          >
            {error ? (
              <p role="alert" className="text-yellow-bright text-sm">
                {t('ai.loadFailed')}
              </p>
            ) : !data ? (
              <p role="status" className="text-muted text-sm">
                {t('ai.loading')}
              </p>
            ) : (
              <>
                {!rows.length && (
                  <p className="text-muted mb-4 text-sm">
                    {t('ai.noInsights')}
                  </p>
                )}
                <div className="space-y-3">
                  {shown.map((row) => (
                    <div
                      key={row.label}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(2rem,1fr)_auto] items-center gap-3 text-sm"
                    >
                      <span
                        className={expanded[kind] ? 'break-words' : 'truncate'}
                        title={row.label}
                      >
                        {row.label}
                      </span>
                      <div className="bg-bg3 h-2 overflow-hidden rounded">
                        <div
                          className="bg-accent h-full rounded"
                          style={{ width: `${(row.count / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-muted text-xs">{row.count}</span>
                    </div>
                  ))}
                </div>
                <p className="text-muted mt-4 text-xs">
                  {t(
                    kind === 'repeated_requirements'
                      ? 'ai.reviewedDenominator'
                      : 'ai.matchDenominator',
                    { count: table?.denominator ?? 0 }
                  )}{' '}
                  {rows.length > 5 && (
                    <button
                      type="button"
                      className="text-accent cursor-pointer rounded hover:underline"
                      onClick={() =>
                        setExpanded((value) => ({
                          ...value,
                          [kind]: !value[kind],
                        }))
                      }
                    >
                      {t(expanded[kind] ? 'ai.showLess' : 'ai.viewAll')}
                    </button>
                  )}
                </p>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
