import { useTranslation } from 'react-i18next';
import CollapsibleCard from '../CollapsibleCard';
import ApplicationBoard from '../ApplicationBoard';
export default function DashboardBoard() {
  const { t } = useTranslation();
  return (
    <CollapsibleCard
      title={t('tasks.applicationBoard')}
      icon="bi-kanban"
      defaultOpen={false}
    >
      <ApplicationBoard compact />
    </CollapsibleCard>
  );
}
