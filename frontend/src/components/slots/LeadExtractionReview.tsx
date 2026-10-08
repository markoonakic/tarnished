import type { JobLead } from '@/lib/types';
import ExtractionReview from '@/components/ai/ExtractionReview';
export default function LeadExtractionReview({
  lead,
  onUpdated,
}: {
  lead: JobLead;
  onUpdated?: () => void;
}) {
  const record = lead as JobLead & {
    source_text?: string | null;
    requirements_revision?: number;
    confirmed_requirements?: { text: string }[];
    pending_analysis_id?: string;
  };
  return (
    <ExtractionReview
      target={{ lead_id: record.id }}
      refreshKey={record.pending_analysis_id ?? record.revision}
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
      hideEmpty
    />
  );
}
