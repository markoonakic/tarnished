import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/displayDate';
import Card from './Card';
import KindPill from './KindPill';
import type { ReminderKind } from '@/lib/uiPills';
export interface ReminderItem {
  id: string;
  kind: ReminderKind;
  title: string;
  due_at: string;
  state: 'open' | 'done' | 'dismissed';
  dueText?: string;
  relatedLabel?: string;
  note?: string | null;
}
export interface RemindersCardProps {
  reminders: ReminderItem[];
  shortcuts?: ReactNode;
  onAdd?: () => void;
  onEdit?: (reminder: ReminderItem) => void;
  onToggle?: (reminder: ReminderItem) => void;
  onDismiss?: (reminder: ReminderItem) => void;
  onDelete?: (reminder: ReminderItem) => void;
  timeZone?: string;
  now?: Date;
}
export default function RemindersCard({
  reminders,
  shortcuts,
  onAdd,
  onEdit,
  onToggle,
  onDismiss,
  onDelete,
  timeZone,
  now = new Date(),
}: RemindersCardProps) {
  const { t } = useTranslation();
  const [showDone, setShowDone] = useState(false);
  const done = reminders.filter((r) => r.state === 'done');
  const visible = reminders
    .filter((r) => r.state === 'open')
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  if (showDone) visible.push(...done);
  return (
    <Card
      title={t('kit.reminders')}
      icon="bi-bell"
      actions={
        onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          >
            <i className="bi bi-plus-lg icon-sm" aria-hidden="true" />
            {t('kit.addReminder')}
          </button>
        )
      }
    >
      {shortcuts}
      <div className="space-y-2">
        {visible.map((reminder) => {
          const completed = reminder.state !== 'open';
          const overdue = !completed && new Date(reminder.due_at) < now;
          return (
            <div
              key={reminder.id}
              className="bg-tertiary flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
            >
              <button
                type="button"
                disabled={!onToggle}
                aria-label={t(
                  completed ? 'kit.reopenReminder' : 'kit.completeReminder',
                  { title: reminder.title }
                )}
                aria-pressed={completed}
                onClick={() => onToggle?.(reminder)}
                className={
                  completed
                    ? 'bg-accent focus:ring-accent flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full focus:ring-2 disabled:cursor-default'
                    : 'border-bg4 hover:border-accent focus:ring-accent h-5 w-5 shrink-0 cursor-pointer rounded-full border-2 focus:ring-2 disabled:cursor-default'
                }
              >
                {completed && (
                  <i
                    className="bi bi-check text-bg0 text-xs"
                    aria-hidden="true"
                  />
                )}
              </button>
              <div className="min-w-[min(100%,12rem)] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      completed
                        ? 'text-fg4 text-sm break-words line-through'
                        : 'text-fg1 text-sm break-words'
                    }
                  >
                    {reminder.title}
                  </span>
                  <KindPill kind={reminder.kind} />
                </div>
                {reminder.relatedLabel && (
                  <p className="text-fg4 text-xs">{reminder.relatedLabel}</p>
                )}
              </div>
              <span
                className={
                  overdue
                    ? 'text-red-bright text-xs font-semibold'
                    : 'text-fg4 text-xs'
                }
              >
                {completed ? (
                  t(reminder.state === 'done' ? 'kit.done' : 'kit.dismissed')
                ) : (
                  <>
                    {overdue && <>{t('kit.overdue')} · </>}
                    {reminder.dueText ??
                      formatDateTime(reminder.due_at, timeZone)}
                  </>
                )}
              </span>
              {(onEdit || onDismiss || onDelete) && (
                <details className="relative">
                  <summary
                    aria-label={t('kit.reminderActions', {
                      title: reminder.title,
                    })}
                    className="text-muted focus:ring-accent hover:bg-bg2 cursor-pointer list-none rounded px-1 transition-all duration-200 ease-in-out focus:ring-2"
                    title={t('kit.reminderActions', {
                      title: reminder.title,
                    })}
                  >
                    <i className="bi bi-three-dots" aria-hidden="true" />
                  </summary>
                  <div className="bg-secondary border-tertiary absolute right-0 z-10 w-36 rounded-lg border p-1 shadow-xl">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.currentTarget
                            .closest('details')
                            ?.removeAttribute('open');
                          onEdit(reminder);
                        }}
                        className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex w-full cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-left text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                      >
                        <i className="bi-pencil icon-sm" aria-hidden="true" />
                        {t('kit.edit')}
                      </button>
                    )}
                    {onDismiss && !completed && (
                      <button
                        type="button"
                        onClick={() => onDismiss(reminder)}
                        className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex w-full cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-left text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                      >
                        <i
                          className="bi-arrow-right icon-sm"
                          aria-hidden="true"
                        />
                        {t('kit.dismiss')}
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(reminder)}
                        className="text-red hover:bg-bg2 hover:text-red-bright focus:ring-accent flex w-full cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-left text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                      >
                        <i className="bi-trash icon-sm" aria-hidden="true" />
                        {t('kit.delete')}
                      </button>
                    )}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
      {reminders.length === 0 && (
        <p className="text-muted text-sm">{t('kit.noReminders')}</p>
      )}
      {done.length > 0 && (
        <button
          type="button"
          aria-expanded={showDone}
          onClick={() => setShowDone(!showDone)}
          className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent mt-3 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
        >
          <i
            className={showDone ? 'bi bi-chevron-up' : 'bi bi-chevron-down'}
            aria-hidden="true"
          />
          {t(showDone ? 'kit.hideDone' : 'kit.showDone', {
            count: done.length,
          })}
        </button>
      )}
    </Card>
  );
}
