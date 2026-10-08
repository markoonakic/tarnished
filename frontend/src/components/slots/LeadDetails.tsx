import type { JobLead } from '@/lib/types';
import RecordDetails from '../records/RecordDetails';
export default function LeadDetails({
  lead,
  onUpdated,
}: {
  lead: JobLead;
  onUpdated?: () => void;
}) {
  return (
    <RecordDetails
      record={lead}
      type="lead"
      title={`${lead.company || ''} — ${lead.title || ''}`}
      onUpdated={onUpdated}
    />
  );
}
