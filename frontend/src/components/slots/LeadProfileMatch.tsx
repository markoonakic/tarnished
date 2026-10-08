import type { JobLead } from '@/lib/types';
import ProfileMatch from '@/components/ai/ProfileMatch';
export default function LeadProfileMatch({
  lead,
}: {
  lead: JobLead;
  onUpdated?: () => void;
}) {
  const record = lead as JobLead & {
    source_text?: string | null;
    requirements_revision?: number;
    pending_analysis_id?: string;
  };
  return (
    <ProfileMatch
      target={{ lead_id: record.id }}
      refreshKey={record.revision}
    />
  );
}
