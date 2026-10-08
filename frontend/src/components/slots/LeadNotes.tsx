import type { JobLead } from '@/lib/types';
import TargetNotes from '../TargetNotes';
export default function LeadNotes({
  lead,
}: {
  lead: JobLead;
  onUpdated?: () => void;
}) {
  return <TargetNotes targetType="lead" targetId={lead.id} />;
}
