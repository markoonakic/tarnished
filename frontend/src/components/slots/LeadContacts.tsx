import type { JobLead } from '@/lib/types';
import LinkedContacts from '../companies/LinkedContacts';
export default function LeadContacts({
  lead,
  onUpdated,
}: {
  lead: JobLead;
  onUpdated?: () => void;
}) {
  return (
    <LinkedContacts
      kind="lead"
      id={lead.id}
      companyId={lead.company_id}
      companyName={lead.company}
      contactId={lead.recruiter_contact_id}
      revision={lead.revision}
      onUpdated={onUpdated}
    />
  );
}
