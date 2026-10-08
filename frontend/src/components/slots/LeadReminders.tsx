import type { JobLead } from '@/lib/types';
import TargetReminders from '../TargetReminders';
export default function LeadReminders({
  lead,
}: {
  lead: JobLead;
  onUpdated?: () => void;
}) {
  const deadline = (lead as JobLead & { deadline?: string | null }).deadline;
  return (
    <TargetReminders
      targetType="lead"
      targetId={lead.id}
      label={[lead.company, lead.title].filter(Boolean).join(' — ')}
      shortcuts={
        deadline ? [{ kind: 'application_deadline', date: deadline }] : []
      }
    />
  );
}
