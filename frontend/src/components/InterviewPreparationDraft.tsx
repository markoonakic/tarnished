import type { ReactNode } from 'react';
import type { Interview } from '@/lib/apiV030';
import PreparationDraft from './ai/PreparationDraft';

export default function InterviewPreparationDraft({
  interview,
  onSaved,
  actions,
  children,
}: {
  interview: Interview;
  onSaved: () => Promise<void>;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <PreparationDraft
      applicationId={interview.application_id}
      roundId={interview.id}
      revision={interview.revision}
      onUpdated={() => void onSaved()}
      actions={actions}
    >
      {children}
    </PreparationDraft>
  );
}
