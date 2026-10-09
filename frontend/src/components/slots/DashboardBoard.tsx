import TextLink from '@/components/ui/TextLink';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
        <TextLink to="/applications?view=board">
          {t('tasks.openFullBoard')} →
        </TextLink>
      }
    >
      {open && <ApplicationBoard compact />}
    </CollapsibleCard>
  );
}
