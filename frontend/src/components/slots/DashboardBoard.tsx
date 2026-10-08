import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import CollapsibleCard from '../CollapsibleCard';
import ApplicationBoard from '../ApplicationBoard';
export default function DashboardBoard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <CollapsibleCard
      title={t('tasks.applicationBoard')}
      icon="bi-kanban"
      open={open}
      onOpenChange={setOpen}
      actions={
        <Link
          to="/applications?view=board"
          className="text-accent focus:ring-accent rounded text-xs focus:ring-2"
        >
          {t('tasks.openFullBoard')} →
        </Link>
      }
    >
      {open && <ApplicationBoard compact />}
    </CollapsibleCard>
  );
}
