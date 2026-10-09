import api from './api';
import { reminderTarget } from './taskDates';
import type { Target } from './apiV030';

export function reminderRelatedQuery(item: Target) {
  const target = reminderTarget(item);
  return {
    queryKey: ['reminder-related', target?.type, target?.id],
    enabled: Boolean(target),
    queryFn: async () => {
      if (!target) return '';
      const path =
        target.type === 'round' ? 'rounds' : target.href.split('/')[1];
      const { data } = await api.get<{
        name?: string;
        company?: string;
        title?: string;
        job_title?: string;
        round_type?: { name: string };
      }>(`/api/${path}/${target.id}`);
      return (
        data.name ??
        [data.company, data.job_title ?? data.title ?? data.round_type?.name]
          .filter(Boolean)
          .join(' — ')
      );
    },
  };
}
