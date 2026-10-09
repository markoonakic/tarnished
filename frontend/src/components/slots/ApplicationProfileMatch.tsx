import type { Application } from '@/lib/types';
import ProfileMatch from '@/components/ai/ProfileMatch';
export default function ApplicationProfileMatch({
  application,
  onUpdated,
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
      onUpdated={onUpdated}
      target={{ application_id: record.id }}
      refreshKey={record.evidence_revision}
      legacy={[
        ...(record.requirements_must_have ?? []),
        ...(record.requirements_nice_to_have ?? []),
      ]}
    />
  );
}
