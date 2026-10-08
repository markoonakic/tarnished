import { useTranslation } from 'react-i18next';
import KindPill from './KindPill';
import ReminderRelated from './ReminderRelated';
import type { Reminder } from '@/lib/apiV030';
import { dueText } from '@/lib/taskDates';
import { useReminderActions } from '@/hooks/useReminderActions';
export default function TaskRow({
  item,
  zone,
  onEdit,
}: {
  item: Reminder;
  zone: string;
  onEdit?: (item: Reminder) => void;
}) {
  const { t } = useTranslation();
  const actions = useReminderActions();
  const done = item.state !== 'open';
  return (
    <div className="bg-bg2 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3">
      <button
        type="button"
        aria-label={t(done ? 'kit.reopenReminder' : 'kit.completeReminder', {
          title: item.title,
        })}
        aria-pressed={done}
        onClick={() => void actions.toggle(item)}
        className={`focus:ring-accent flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 focus:ring-2 ${done ? 'bg-accent border-accent text-bg0' : 'border-bg4 hover:border-accent'}`}
      >
        {done && <i className="bi bi-check" aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className={`text-sm ${done ? 'text-muted line-through' : 'text-primary'}`}
          >
            {item.title}
          </span>
          <KindPill kind={item.kind} />
        </div>
        <ReminderRelated item={item} />
      </div>
      <span
        className={`text-xs ${!done && new Date(item.due_at) < new Date() ? 'text-red-bright' : 'text-muted'}`}
      >
        {done ? t('kit.' + item.state) : dueText(item.due_at, zone)}
      </span>
      {done && (
        <button
          className="text-accent text-xs underline"
          onClick={() => void actions.toggle(item)}
        >
          {t('tasks.reopen')}
        </button>
      )}
      {onEdit && (
        <details className="relative">
          <summary
            className="text-muted focus:ring-accent cursor-pointer list-none rounded px-1 focus:ring-2"
            aria-label={t('kit.reminderActions', { title: item.title })}
          >
            <i className="bi bi-three-dots" aria-hidden="true" />
          </summary>
          <div className="bg-secondary border-tertiary absolute right-0 z-10 w-36 rounded-lg border p-1 shadow-xl">
            <button
              className="hover:bg-bg2 block w-full rounded px-3 py-2 text-left text-sm"
              onClick={(e) => {
                e.currentTarget.closest('details')?.removeAttribute('open');
                onEdit(item);
              }}
            >
              {t('Edit')}
            </button>
            {!done && (
              <button
                className="hover:bg-bg2 block w-full rounded px-3 py-2 text-left text-sm"
                onClick={() => void actions.dismiss(item)}
              >
                {t('kit.dismiss')}
              </button>
            )}
            <button
              className="text-red-bright hover:bg-bg2 block w-full rounded px-3 py-2 text-left text-sm"
              onClick={() => void actions.remove(item)}
            >
              {t('Delete')}
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
