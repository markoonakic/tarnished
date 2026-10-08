import type { Application } from '@/lib/types';
import LinkedContacts from '../companies/LinkedContacts';
export default function ApplicationContacts({
  application,
  onUpdated,
}: {
  application: Application;
  onUpdated?: () => void;
}) {
  return (
    <LinkedContacts
      kind="application"
      id={application.id}
      companyId={application.company_id}
      companyName={application.company}
      contactId={application.recruiter_contact_id}
      revision={application.evidence_revision}
      onUpdated={onUpdated}
    />
  );
}
