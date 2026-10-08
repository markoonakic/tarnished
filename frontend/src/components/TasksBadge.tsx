import { useTranslation } from 'react-i18next';
import { useTasksBadge } from '@/hooks/useTasksBadge';
export default function TasksBadge({
  count,
  overdue,
}: {
  count?: number;
  overdue?: boolean;
}) {
  const { t } = useTranslation();
  const badge = useTasksBadge();
  const total = count ?? badge.count;
  if (total <= 0) return null;
  return (
    <span
      aria-label={t('kit.tasksDue', { count: total })}
      className={`${(overdue ?? badge.overdue) ? 'bg-red text-fg0' : 'bg-bg3 text-fg1'} ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold`}
    >
      {total}
    </span>
  );
}
