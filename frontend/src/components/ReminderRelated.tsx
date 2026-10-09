import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { reminderRelatedQuery } from '@/lib/reminderRelated';
import { reminderTarget } from '@/lib/taskDates';
import type { Target } from '@/lib/apiV030';
import { useTranslation } from 'react-i18next';

export default function ReminderRelated({ item }: { item: Target }) {
  const { t } = useTranslation();
  const target = reminderTarget(item);
  const query = useQuery(reminderRelatedQuery(item));
  return target ? (
    <Link
      to={target.href}
      className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
    >
      {query.data || t('tasks.openRecord')}
    </Link>
  ) : null;
}
