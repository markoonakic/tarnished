import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { reminderTarget } from '@/lib/taskDates';
import type { Target } from '@/lib/apiV030';
import { useTranslation } from 'react-i18next';

export default function ReminderRelated({ item }: { item: Target }) {
  const { t } = useTranslation();
  const target = reminderTarget(item);
  const query = useQuery({
    queryKey: ['reminder-related', target?.type, target?.id],
    enabled: Boolean(target),
    queryFn: async () => {
      const path =
        target!.type === 'round' ? 'rounds' : target!.href.split('/')[1];
      const { data } = await api.get<{
        name?: string;
        company?: string;
        title?: string;
        job_title?: string;
        round_type?: { name: string };
      }>(`/api/${path}/${target!.id}`);
      return (
        data.name ??
        [data.company, data.job_title ?? data.title ?? data.round_type?.name]
          .filter(Boolean)
          .join(' — ')
      );
    },
  });
  return target ? (
    <Link
      to={target.href}
      className="text-accent hover:text-accent-bright focus:ring-accent block rounded text-xs focus:ring-2"
    >
      {query.data || t('tasks.openRecord')}
    </Link>
  ) : null;
}
