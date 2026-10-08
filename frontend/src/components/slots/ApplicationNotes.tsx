import type { Application } from '@/lib/types';
import TargetNotes from '../TargetNotes';
export default function ApplicationNotes({
  application,
}: {
  application: Application;
  onUpdated?: () => void;
}) {
  return <TargetNotes targetType="application" targetId={application.id} />;
}
