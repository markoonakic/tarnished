import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/displayDate';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/lib/errorMessage';
import type { FeedbackController } from '../hooks/useFeedback';
import Modal from './Modal';

/** Shared copy for the same report protocol; speech keeps its separate retry rules. */
export default function FeedbackStatus({
  feedback,
  requestLabel,
  emptyHint = t(
    'No feedback yet. Get suggestions from your saved information.'
  ),
  hideAction = false,
  readyLabel,
  requestedPeriod,
  savedPeriod,
  activePeriod,
}: {
  feedback: FeedbackController;
  requestLabel: string;
  emptyHint?: string;
  hideAction?: boolean;
  readyLabel?: string;
  requestedPeriod?: string;
  savedPeriod?: string;
  activePeriod?: string;
}) {
  useTranslation();
  const {
    state,
    starting,
    running,
    unknown,
    failed,
    terminalUncertain,
    requestError,
  } = feedback;
  const report = state?.report;
  const differentScope = state?.stale_reason_code === 'scope_changed';
  const staleMessage = differentScope
    ? t('Saved feedback uses different settings. Update feedback when ready.')
    : state?.stale_reason_code === 'prompt_changed'
      ? t('Feedback instructions changed. Update feedback when ready.')
      : state?.stale_reason_code === 'prompt_unknown'
        ? t(
            'Saved feedback may use older instructions. Update feedback when ready.'
          )
        : t(
            'Your saved information has changed. This feedback may be out of date.'
          );
  const failureDetail =
    state?.job?.state !== 'invalidated'
      ? state?.job?.error
        ? errorMessage({ code: state.job.error_code })
        : requestError || null
      : null;
  const periodChanged =
    !!report &&
    !!savedPeriod &&
    !!requestedPeriod &&
    savedPeriod !== requestedPeriod;
  const forPeriod = activePeriod
    ? t(' for {{activePeriod}}', { activePeriod: activePeriod })
    : '';
  let message = '';
  if (starting)
    message = t('Starting feedback{{forPeriod}}…', { forPeriod: forPeriod });
  else if (running)
    message =
      state?.job?.state === 'queued'
        ? t('Waiting to start{{forPeriod}}…', { forPeriod: forPeriod })
        : t('Preparing feedback{{forPeriod}}…', { forPeriod: forPeriod });
  else if (feedback.loading) message = t('Loading saved feedback…');
  else if (feedback.readError)
    message = t(
      'Cannot load feedback. Check the connection and try loading again.'
    );
  else if (unknown)
    message = t(
      'The request outcome is not confirmed. Check status before starting another request.'
    );
  else if (failed || requestError)
    message = report
      ? failureDetail
        ? t('{{failureDetail}} Your saved feedback is still available below.', {
            failureDetail: failureDetail,
          })
        : t(
            'Could not update feedback. Your saved feedback is still available.'
          )
      : failureDetail ||
        (state?.job?.state === 'interrupted'
          ? t('Feedback was interrupted.')
          : t('Could not create feedback.'));
  else if (periodChanged)
    message = t('Saved feedback is for {{savedPeriod}}.', {
      savedPeriod: savedPeriod,
    });
  else if (report && state?.stale_reason) message = staleMessage;
  else if (report)
    message =
      readyLabel ||
      t('Feedback ready · {{value0}}', {
        value0: formatDate(report.run_at),
      });
  else if (state) message = emptyHint;

  if (running && (state?.job?.total_sections ?? 0) > 1)
    message += t(
      ' {{completed_sections}} of {{total_sections}} parts reviewed.',
      {
        completed_sections: state!.job!.completed_sections,
        total_sections: state!.job!.total_sections,
      }
    );
  if (!running && !starting && (unknown || terminalUncertain))
    message += t('· Trying again may repeat work or charges.');

  const problem = feedback.readError || unknown || failed || !!requestError;
  return (
    <div className="mt-3 space-y-2 text-sm">
      {feedback.confirmRetry && (
        <Modal onClose={feedback.cancelRetry} label={t('Try again')}>
          <div className="bg-secondary w-full max-w-lg rounded-lg p-6">
            <h2 className="text-primary mb-4 text-lg font-semibold">
              {t('Try again')}
            </h2>
            <p className="text-fg1 mb-4">
              {t(
                'Try again? The service may already have processed this request. Another attempt can repeat work or charges.'
              )}
            </p>
            <div className="flex justify-end gap-3">
              <Button type="button" onClick={feedback.cancelRetry}>
                {t('Cancel')}
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={() => void feedback.confirmRequest()}
              >
                {t('Try again')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {message && (
        <p
          role={problem ? 'alert' : 'status'}
          className={
            problem
              ? 'text-yellow-bright'
              : report &&
                  state?.stale_reason &&
                  !differentScope &&
                  !periodChanged &&
                  !starting &&
                  !running
                ? 'text-yellow-bright'
                : 'text-fg1'
          }
        >
          {(starting || running || feedback.loading) && (
            <i
              className="bi-arrow-repeat icon-sm mr-2 inline-block animate-spin"
              aria-hidden="true"
            />
          )}
          {message}
        </p>
      )}
      {report && (savedPeriod || starting || running) && (
        <p className="text-muted">
          {savedPeriod
            ? t('Showing saved feedback for {{savedPeriod}}.', {
                savedPeriod: savedPeriod,
              })
            : t('Showing saved feedback.')}
        </p>
      )}
      {state && !state.capability.available && (
        <p className="text-muted">
          {t(
            'New feedback is unavailable. Ask your administrator to check the AI settings. Saved feedback can still be read.'
          )}
        </p>
      )}
      {!hideAction && !feedback.loading && !starting && !running && (
        <Button
          variant="primary"
          type="button"
          aria-label={`${feedback.actionLabel}: ${requestLabel}`}
          disabled={feedback.disabled}
          onClick={() => void feedback.request()}
          className={` ${feedback.readError || feedback.actionLabel === t('Check status') ? '' : 'feedback-primary'} `}
        >
          {feedback.actionLabel}
        </Button>
      )}
    </div>
  );
}
