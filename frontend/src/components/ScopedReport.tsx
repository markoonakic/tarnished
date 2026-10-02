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
}

const periods: Record<string, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '3m': 'Last 3 months',
  all: 'All time',
};

function savedLabel(report: NonNullable<FeedbackState['report']>) {
  const parts = [
    report.period ? (periods[report.period] ?? report.period) : null,
    report.as_of
      ? new Date(report.as_of).toLocaleDateString(undefined, {
          timeZone: report.time_zone ?? undefined,
        })
      : null,
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
}: ReportProps & { feedback: FeedbackController; hideAction?: boolean }) {
  const report = feedback.state?.report;

  return (
    <section
      className="border-accent bg-bg1 mt-4 space-y-3 rounded-lg border-t-2 p-6"
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-primary text-lg font-semibold">{title}</h3>
          <HelpTip label={`About ${title.toLowerCase()}`}>
            <p>
              Uses your saved information and the configured AI service. Charges
              may apply only when you request feedback.
            </p>
            {scope === 'PIPELINE' && (
              <p>Changing the chart period does not generate new feedback.</p>
            )}
          </HelpTip>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label={`Close ${title.toLowerCase()}`}
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
      />
      {scope === 'PIPELINE' && report?.period && (
        <p className="text-muted text-sm">
          Saved feedback: {savedLabel(report)}
          {feedback.state?.period &&
            feedback.state.period !== report.period && (
              <>
                . Charts:{' '}
                {periods[feedback.state.period] ?? feedback.state.period}. The
                saved feedback still uses its original cohort.
              </>
            )}
        </p>
      )}
      {report && (
        <div className="max-w-3xl space-y-3" aria-label="Saved feedback">
          {!report.findings.length && (
            <p className="text-fg1">
              No actionable feedback from the saved information this time.
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
