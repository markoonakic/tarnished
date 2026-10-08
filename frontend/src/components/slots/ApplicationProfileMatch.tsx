import type { Application } from '@/lib/types';
import ProfileMatch from '@/components/ai/ProfileMatch';
export default function ApplicationProfileMatch({
  application,
}: {
  application: Application;
  onUpdated?: () => void;
}) {
  const record = application as Application & {
    source_text?: string | null;
    requirements_revision?: number;
    pending_analysis_id?: string;
  };
  return (
    <ProfileMatch
      target={{ application_id: record.id }}
      refreshKey={record.evidence_revision}
    />
  );
}
