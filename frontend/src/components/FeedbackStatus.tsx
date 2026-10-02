import type { FeedbackController } from '../hooks/useFeedback';

/** Shared copy for the same report protocol; speech keeps its separate retry rules. */
export default function FeedbackStatus({
  feedback,
  requestLabel,
  emptyHint = 'No feedback yet. Get suggestions from your saved information.',
  hideAction = false,
}: {
  feedback: FeedbackController;
  requestLabel: string;
  emptyHint?: string;
  hideAction?: boolean;
}) {
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
  const differentScope = state?.stale_reason?.startsWith(
    'pipeline scope or text configuration changed'
  );
  const staleMessage = differentScope
    ? 'Saved feedback uses a different period or AI configuration. Request feedback for this period to update it.'
    : state?.stale_reason?.startsWith('feedback prompt changed')
      ? 'The feedback instructions have changed. Update feedback to use the current version.'
      : state?.stale_reason?.startsWith('feedback prompt version unknown')
        ? 'This saved feedback has no recorded instruction version. It may be out of date. Update it to use the current version.'
        : 'Your saved information has changed. This feedback may be out of date.';
  const failureDetail =
    state?.job?.state !== 'invalidated'
      ? state?.job?.error || requestError || null
      : null;
  let message = '';
  if (starting) message = 'Starting feedback…';
  else if (running)
    message =
      state?.job?.state === 'queued'
        ? 'Waiting to start…'
        : 'Preparing feedback…';
  else if (feedback.loading) message = 'Loading saved feedback…';
  else if (feedback.readError)
    message =
      'Cannot load feedback. Check the connection and try loading again.';
  else if (unknown)
    message =
      'The request outcome is not confirmed. Check status before starting another request.';
  else if (failed || requestError)
    message = report
      ? failureDetail
        ? `${failureDetail} Your saved feedback is still available below.`
        : 'Could not update feedback. Your saved feedback is still available.'
      : failureDetail ||
        (state?.job?.state === 'interrupted'
          ? 'Feedback was interrupted.'
          : 'Could not create feedback.');
  else if (report && state?.stale_reason) message = staleMessage;
  else if (report)
    message = `Feedback ready · ${new Date(report.run_at).toLocaleDateString()}`;
  else if (state) message = emptyHint;

  const problem = feedback.readError || unknown || failed || !!requestError;
  return (
    <div className="mt-3 space-y-2 text-sm">
      {message && (
        <p
          role={problem ? 'alert' : 'status'}
          className={
            problem
              ? 'text-yellow-bright'
              : report && state?.stale_reason && !differentScope
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
      {(starting || running) && (
        <p className="text-muted">
          You can keep using this page. The result will appear here when ready.
        </p>
      )}
      {!running && !starting && (unknown || terminalUncertain) && (
        <p className="text-muted">
          The service may already have processed part of this request. Trying
          again may repeat work or charges.
        </p>
      )}
      {report && (starting || running || failed || unknown) && (
        <p className="text-muted">
          Saved feedback from {new Date(report.run_at).toLocaleDateString()} is
          shown below.
        </p>
      )}
      {report &&
        state?.stale_reason &&
        (starting || running || failed || unknown) && (
          <p className={differentScope ? 'text-fg1' : 'text-yellow-bright'}>
            {staleMessage}
          </p>
        )}
      {state && !state.capability.available && (
        <p className="text-muted">
          New feedback is unavailable. Ask your administrator to check the AI
          settings. Saved feedback can still be read.
        </p>
      )}
      {running && (state?.job?.total_sections ?? 0) > 1 && (
        <p className="text-muted">
          {state!.job!.completed_sections} of {state!.job!.total_sections} parts
          reviewed.
        </p>
      )}
      {!hideAction && !feedback.loading && (
        <button
          type="button"
          aria-label={`${feedback.actionLabel}: ${requestLabel}`}
          disabled={feedback.disabled}
          onClick={() => void feedback.request()}
          className={`cursor-pointer rounded px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${feedback.readError || feedback.actionLabel === 'Check status' ? 'text-fg1 hover:bg-bg3' : 'feedback-primary bg-accent text-bg0 hover:bg-accent-bright'}`}
        >
          {feedback.actionLabel}
        </button>
      )}
    </div>
  );
}
