import Button from '@/components/ui/Button';
import PopoverLayer from '@/components/ui/PopoverLayer';
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
          <Button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1.5"
          >
            <i className="bi bi-plus-lg icon-sm" aria-hidden="true" />
            {t('kit.addReminder')}
          </Button>
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
              <Button
                variant="primary"
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
                    ? 'flex h-5 w-5 shrink-0 items-center justify-center'
                    : 'h-5 w-5 shrink-0'
                }
              >
                {completed && (
                  <i
                    className="bi bi-check text-bg0 text-xs"
                    aria-hidden="true"
                  />
                )}
              </Button>
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
                  <PopoverLayer className="p-2">
                    {onEdit && (
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.currentTarget
                            .closest('details')
                            ?.removeAttribute('open');
                          onEdit(reminder);
                        }}
                        className="flex w-full items-center gap-1.5 text-left"
                      >
                        <i className="bi-pencil icon-sm" aria-hidden="true" />
                        {t('kit.edit')}
                      </Button>
                    )}
                    {onDismiss && !completed && (
                      <Button
                        type="button"
                        onClick={() => onDismiss(reminder)}
                        className="flex w-full items-center gap-1.5 text-left"
                      >
                        <i
                          className="bi-arrow-right icon-sm"
                          aria-hidden="true"
                        />
                        {t('kit.dismiss')}
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="danger"
                        type="button"
                        onClick={() => onDelete(reminder)}
                        className="flex w-full items-center gap-1.5 text-left"
                      >
                        <i className="bi-trash icon-sm" aria-hidden="true" />
                        {t('kit.delete')}
                      </Button>
                    )}
                  </PopoverLayer>
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
        <Button
          type="button"
          aria-expanded={showDone}
          onClick={() => setShowDone(!showDone)}
          className="mt-3 flex items-center gap-1.5"
        >
          <i
            className={showDone ? 'bi bi-chevron-up' : 'bi bi-chevron-down'}
            aria-hidden="true"
          />
          {t(showDone ? 'kit.hideDone' : 'kit.showDone', {
            count: done.length,
          })}
        </Button>
      )}
    </Card>
  );
}
