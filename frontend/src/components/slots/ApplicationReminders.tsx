import type { Application } from '@/lib/types';
import TargetReminders from '../TargetReminders';
export default function ApplicationReminders({
  application,
}: {
  application: Application;
  onUpdated?: () => void;
}) {
  const deadline = (application as Application & { deadline?: string | null })
    .deadline;
  return (
    <TargetReminders
      targetType="application"
      targetId={application.id}
      label={`${application.company} — ${application.job_title}`}
      shortcuts={
        deadline ? [{ kind: 'application_deadline', date: deadline }] : []
      }
    />
  );
}
