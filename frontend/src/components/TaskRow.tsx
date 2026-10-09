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
    <div className="bg-tertiary flex flex-wrap items-center gap-3 rounded-lg p-4">
      <button
        type="button"
        aria-label={t(done ? 'kit.reopenReminder' : 'kit.completeReminder', {
          title: item.title,
        })}
        aria-pressed={done}
        onClick={() => void actions.toggle(item)}
        title={t(done ? 'kit.reopenReminder' : 'kit.completeReminder', {
          title: item.title,
        })}
        className={`hover:bg-bg3 focus:ring-accent flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-all duration-200 ease-in-out focus:ring-2 ${done ? 'bg-accent border-accent text-bg0' : 'border-bg4 hover:border-accent'}`}
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
          <span className="max-w-full [&>span]:max-w-full [&>span]:whitespace-normal">
            <KindPill kind={item.kind} />
          </span>
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
          className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          onClick={() => void actions.toggle(item)}
        >
          <i className="bi-arrow-right icon-sm" aria-hidden="true" />
          {t('tasks.reopen')}
        </button>
      )}
      {onEdit && (
        <details className="relative">
          <summary
            className="text-muted hover:text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer list-none rounded p-1.5 transition-all duration-200 ease-in-out focus:ring-2"
            title={t('kit.reminderActions', { title: item.title })}
            aria-label={t('kit.reminderActions', { title: item.title })}
          >
            <i className="bi bi-three-dots" aria-hidden="true" />
          </summary>
          <div className="bg-secondary border-tertiary absolute right-0 z-10 w-36 rounded-lg border p-1 shadow-xl">
            <button
              className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex w-full cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-left text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
              onClick={(e) => {
                e.currentTarget.closest('details')?.removeAttribute('open');
                onEdit(item);
              }}
            >
              <i className="bi-pencil icon-sm" aria-hidden="true" />
              {t('Edit')}
            </button>
            {!done && (
              <button
                className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex w-full cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-left text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                onClick={() => void actions.dismiss(item)}
              >
                <i className="bi-arrow-right icon-sm" aria-hidden="true" />
                {t('kit.dismiss')}
              </button>
            )}
            <button
              className="text-red hover:bg-bg2 hover:text-red-bright focus:ring-accent flex w-full cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-left text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
              onClick={() => void actions.remove(item)}
            >
              <i className="bi-trash icon-sm" aria-hidden="true" />
              {t('Delete')}
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
