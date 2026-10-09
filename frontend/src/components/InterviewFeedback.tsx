import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import type { Round } from '../lib/types';
import { useFeedback, type FeedbackState } from '../hooks/useFeedback';
import FeedbackStatus from './FeedbackStatus';
import HelpTip from './HelpTip';
import FeedbackFindings from './FeedbackFindings';

export type InterviewState = FeedbackState & { generation: number };

export default function InterviewFeedback({
  round,
  onClose,
}: {
  round: Round;
  onClose?: () => void;
}) {
  useTranslation();
  const feedback = useFeedback<InterviewState>(
    `/api/rounds/${round.id}/interview-feedback`,
    (state) => ({
      generation: state.generation,
      config_revision: state.capability.configuration_revision,
    })
  );
  const report = feedback.state?.report;
  return (
    <section
      className="border-accent mt-4 space-y-3 border-t-2 pt-4"
      aria-label={t('Interview feedback')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-primary text-lg font-semibold">
            {t('Interview feedback')}
          </h3>
          <HelpTip label={t('About interview feedback')}>
            <p>
              {t(
                'Uses your transcript and job details with the configured AI service. Charges may apply only when you request feedback.'
              )}
            </p>
            <p>
              {t(
                'Save a transcript and identify your answers as Candidate before requesting personal feedback.'
              )}
            </p>
          </HelpTip>
        </div>
        {onClose && (
          <Button
            variant="icon"
            type="button"
            aria-label={t('Close interview feedback')}
            onClick={onClose}
          >
            <i className="bi-x-lg icon-lg" aria-hidden="true" />
          </Button>
        )}
      </div>
      <FeedbackStatus
        feedback={feedback}
        requestLabel={t('interview feedback')}
        emptyHint={t('No feedback yet.')}
      />
      {report && (
        <div
          className="max-w-3xl space-y-3"
          aria-label={t('Saved interview feedback')}
        >
          {!report.findings.length && (
            <p className="text-fg1">
              {t(
                'No actionable feedback from the saved information this time. Check that your answers are identified as Candidate in the transcript and the application has job requirements.'
              )}
            </p>
          )}
          {report.findings.length > 0 && (
            <FeedbackFindings
              key={report.run_at}
              report={report}
              scope="interview"
            />
          )}
        </div>
      )}
    </section>
  );
}
