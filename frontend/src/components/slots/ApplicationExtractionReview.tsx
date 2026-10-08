import type { Application } from '@/lib/types';
import ExtractionReview from '@/components/ai/ExtractionReview';
export default function ApplicationExtractionReview({
  application,
  onUpdated,
}: {
  application: Application;
  onUpdated?: () => void;
}) {
  const record = application as Application & {
    source_text?: string | null;
    requirements_revision?: number;
    confirmed_requirements?: { text: string }[];
    pending_analysis_id?: string;
  };
  return (
    <ExtractionReview
      target={{ application_id: record.id }}
      refreshKey={record.pending_analysis_id ?? record.evidence_revision}
      source={record.source_text}
      current={{ ...record }}
      legacy={[
        ...(record.requirements_must_have ?? []),
        ...(record.requirements_nice_to_have ?? []),
      ].filter(
        (text) =>
          !(record.confirmed_requirements ?? []).some(
            (item) => item.text === text
          )
      )}
      onUpdated={onUpdated}
    />
  );
}
