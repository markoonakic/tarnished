import Button from '@/components/ui/Button';
import PopoverLayer from '@/components/ui/PopoverLayer';
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
    <div className="bg-tertiary grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg p-4 sm:flex sm:flex-wrap sm:items-center">
      <Button
        variant="primary"
        type="button"
        aria-label={t(done ? 'kit.reopenReminder' : 'kit.completeReminder', {
          title: item.title,
        })}
        aria-pressed={done}
        onClick={() => void actions.toggle(item)}
        title={t(done ? 'kit.reopenReminder' : 'kit.completeReminder', {
          title: item.title,
        })}
        className={`flex h-5 w-5 shrink-0 items-center justify-center ${done ? '' : ''} `}
      >
        {done && <i className="bi bi-check" aria-hidden="true" />}
      </Button>
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
        className={`col-start-2 row-start-2 text-xs ${!done && new Date(item.due_at) < new Date() ? 'text-red-bright' : 'text-muted'}`}
      >
        {done ? t('kit.' + item.state) : dueText(item.due_at, zone)}
      </span>
      {done && (
        <Button
          className="flex items-center gap-1.5"
          onClick={() => void actions.toggle(item)}
        >
          <i className="bi-arrow-right icon-sm" aria-hidden="true" />
          {t('tasks.reopen')}
        </Button>
      )}
      {onEdit && (
        <details className="relative col-start-3 row-start-1">
          <summary
            className="text-muted hover:text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer list-none rounded p-1.5 transition-all duration-200 ease-in-out focus:ring-2"
            title={t('kit.reminderActions', { title: item.title })}
            aria-label={t('kit.reminderActions', { title: item.title })}
          >
            <i className="bi bi-three-dots" aria-hidden="true" />
          </summary>
          <PopoverLayer className="p-2">
            <Button
              className="flex w-full items-center gap-1.5 text-left"
              onClick={(e) => {
                e.currentTarget.closest('details')?.removeAttribute('open');
                onEdit(item);
              }}
            >
              <i className="bi-pencil icon-sm" aria-hidden="true" />
              {t('Edit')}
            </Button>
            {!done && (
              <Button
                className="flex w-full items-center gap-1.5 text-left"
                onClick={() => void actions.dismiss(item)}
              >
                <i className="bi-arrow-right icon-sm" aria-hidden="true" />
                {t('kit.dismiss')}
              </Button>
            )}
            <Button
              variant="danger"
              className="flex w-full items-center gap-1.5 text-left"
              onClick={() => void actions.remove(item)}
            >
              <i className="bi-trash icon-sm" aria-hidden="true" />
              {t('Delete')}
            </Button>
          </PopoverLayer>
        </details>
      )}
    </div>
  );
}
