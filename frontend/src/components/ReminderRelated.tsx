import TextLink from '@/components/ui/TextLink';
import { useQuery } from '@tanstack/react-query';

import { reminderRelatedQuery } from '@/lib/reminderRelated';
import { reminderTarget } from '@/lib/taskDates';
import type { Target } from '@/lib/apiV030';
import { useTranslation } from 'react-i18next';

export default function ReminderRelated({ item }: { item: Target }) {
  const { t } = useTranslation();
  const target = reminderTarget(item);
  const query = useQuery(reminderRelatedQuery(item));
  return target ? (
    <TextLink to={target.href}>{query.data || t('tasks.openRecord')}</TextLink>
  ) : null;
}
