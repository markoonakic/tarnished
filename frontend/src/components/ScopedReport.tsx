import { formatDate } from '@/lib/displayDate';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import {
  useFeedback,
  type FeedbackController,
  type FeedbackState,
} from '../hooks/useFeedback';
import FeedbackStatus from './FeedbackStatus';
import HelpTip from './HelpTip';
import FeedbackFindings from './FeedbackFindings';

export type ScopedReportState = FeedbackState;
interface ReportProps {
  title: string;
  scope: string;
  requestLabel: string;
  emptyHint?: string;
  onClose?: () => void;
  period?: string;
}

const periods: Record<string, string> = {
  get '7d'() {
    return t('Last 7 days');
  },
  get '30d'() {
    return t('Last 30 days');
  },
  get '3m'() {
    return t('Last 3 months');
  },
  get all() {
    return t('All time');
  },
};

function savedLabel(report: NonNullable<FeedbackState['report']>) {
  const parts = [
    report.period ? (periods[report.period] ?? report.period) : null,
    formatDate(report.as_of || report.run_at, report.time_zone ?? undefined),
  ].filter(Boolean);
  return parts.join(' · ');
}

/** The ordinary application entry reads state; it never requests feedback on mount. */
export default function ScopedReport({
  endpoint,
  requestBody,
  ...props
}: ReportProps & {
  endpoint: string;
  requestBody: (state: ScopedReportState) => Record<string, unknown>;
}) {
  useTranslation();
  const feedback = useFeedback(endpoint, requestBody);
  return <ScopedReportContent {...props} feedback={feedback} />;
}

/** Analytics shares this result view with its real header request button. */
export function ScopedReportContent({
  title,
  scope,
  requestLabel,
  emptyHint,
  onClose,
  feedback,
  hideAction = false,
  period,
}: ReportProps & { feedback: FeedbackController; hideAction?: boolean }) {
  useTranslation();
  const report = feedback.state?.report;
  const requestedPeriod = period ?? feedback.state?.period;
  const activePeriod = feedback.requestedPeriod;

  return (
    <section
      className="border-accent bg-bg1 mt-4 space-y-3 rounded-lg border-t-2 p-6"
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-primary text-lg font-semibold">{title}</h3>
          <HelpTip
            label={t('About {{value0}}', { value0: title.toLowerCase() })}
          >
            <p>
              {t(
                'Uses your saved information and the configured AI service. Charges may apply only when you request feedback.'
              )}
            </p>
            {scope === 'PIPELINE' && (
              <p>
                {t('Changing the chart period does not generate new feedback.')}
              </p>
            )}
          </HelpTip>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label={t('Close {{value0}}', { value0: title.toLowerCase() })}
            onClick={onClose}
            className="text-fg1 hover:bg-bg2 cursor-pointer rounded p-2"
          >
            <i className="bi-x-lg icon-lg" aria-hidden="true" />
          </button>
        )}
      </div>
      <FeedbackStatus
        feedback={feedback}
        requestLabel={requestLabel}
        emptyHint={emptyHint}
        hideAction={hideAction}
        readyLabel={
          scope === 'PIPELINE' && report ? savedLabel(report) : undefined
        }
        requestedPeriod={
          scope === 'PIPELINE' && requestedPeriod
            ? (periods[requestedPeriod] ?? requestedPeriod)
            : undefined
        }
        activePeriod={
          activePeriod ? (periods[activePeriod] ?? activePeriod) : undefined
        }
        savedPeriod={
          scope === 'PIPELINE' && report?.period
            ? (periods[report.period] ?? report.period)
            : undefined
        }
      />
      {report && (
        <div className="max-w-3xl space-y-3" aria-label={t('Saved feedback')}>
          {!report.findings.length && (
            <p className="text-fg1">
              {t(
                'No actionable feedback from the saved information this time.'
              )}
            </p>
          )}
          {report.findings.length > 0 && (
            <FeedbackFindings
              key={report.run_at}
              report={report}
              scope={scope === 'PIPELINE' ? 'pipeline' : 'application'}
            />
          )}
        </div>
      )}
    </section>
  );
}
