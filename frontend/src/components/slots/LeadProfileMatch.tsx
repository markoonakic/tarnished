import type { JobLead } from '@/lib/types';
import ProfileMatch from '@/components/ai/ProfileMatch';
export default function LeadProfileMatch({
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
    <ProfileMatch
      onUpdated={onUpdated}
      target={{ lead_id: record.id }}
      refreshKey={record.revision}
      legacy={[
        ...(record.requirements_must_have ?? []),
        ...(record.requirements_nice_to_have ?? []),
      ]}
    />
  );
}
