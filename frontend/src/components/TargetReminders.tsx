import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  apiV030,
  type Reminder,
  type ReminderKind,
  type TargetType,
} from '@/lib/apiV030';
import { reminderDraft, reminderTargetFields } from '@/lib/taskDates';
import { parseRoundDateTime, getEffectiveTimeZone } from '@/lib/roundDateTime';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useReminderActions } from '@/hooks/useReminderActions';
import RemindersCard, { type ReminderItem } from './RemindersCard';
import ReminderModal, { type ReminderDraft } from './ReminderModal';

export interface ReminderShortcut {
  kind: ReminderKind;
  date: string;
  title?: string;
}
export default function TargetReminders({
  targetType,
  targetId,
  label,
  shortcuts = [],
  shortcutsOnly = false,
  iconOnly = false,
}: {
  targetType: TargetType;
  targetId: string;
  label: string;
  shortcuts?: ReminderShortcut[];
  shortcutsOnly?: boolean;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const preferences = useUserPreferences();
  const zone = preferences.data ? getEffectiveTimeZone(preferences.data) : null;
  const actions = useReminderActions();
  const query = useQuery({
    queryKey: ['reminders', targetType, targetId],
    queryFn: () =>
      apiV030.reminders({
        target_type: targetType,
        target_id: targetId,
        per_page: 100,
      }),
  });
  const [modal, setModal] = useState<{
    item?: Reminder;
    draft?: Partial<ReminderDraft>;
    intent: string;
  } | null>(null);
  const edit = (row: ReminderItem) => {
    const item = query.data?.items.find((i) => i.id === row.id);
    if (item && zone)
      setModal({
        item,
        draft: reminderDraft(item, zone),
        intent: item.intent_id,
      });
  };
  const openShortcut = (shortcut: ReminderShortcut) => {
    const existing = query.data?.items.find(
      (r) => r.kind === shortcut.kind && r.state === 'open'
    );
    if (existing) return edit(existing);
    if (!zone) return;
    const isInterview = shortcut.kind === 'interview';
    const date = isInterview
      ? new Date(new Date(shortcut.date).getTime() - 3_600_000).toISOString()
      : shortcut.date;
    const parsed =
      date.length > 10
        ? parseRoundDateTime(date, zone)
        : { date, time: '09:00' };
    setModal({
      draft: {
        kind: shortcut.kind,
        title: shortcut.title ?? t('tasks.followUp', { name: label }),
        due_date: parsed.date,
        due_time: isInterview ? parsed.time : '09:00',
      },
      intent: crypto.randomUUID(),
    });
  };
  return (
    <>
      {shortcuts.length > 0 && (
        <span className={shortcutsOnly ? 'inline-flex flex-wrap gap-2' : 'mb-3 flex flex-wrap gap-2'}>
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.kind}
              type="button"
              aria-label={t('tasks.remindMe')}
              title={t('kit.kind.' + shortcut.kind)}
              disabled={!zone || query.isPending}
              onClick={() => openShortcut(shortcut)}
              className="text-accent hover:bg-bg2 focus:ring-accent rounded px-3 py-1.5 text-sm focus:ring-2 disabled:opacity-50"
            >
              <i
                className={`bi ${query.data?.items.some((r) => r.kind === shortcut.kind && r.state === 'open') ? 'bi-bell-fill' : 'bi-bell-plus'} mr-2`}
                aria-hidden="true"
              />
              {!iconOnly && <>{t('tasks.remindMe')}{!shortcutsOnly && <> · {t('kit.kind.' + shortcut.kind)}</>}</>}
            </button>
          ))}
        </span>
      )}
      {query.isError && (
        <p role="alert" className="text-red-bright mb-3">
          {t('tasks.loadFailed')}{' '}
          <button onClick={() => void query.refetch()} className="underline">
            {t('Retry')}
          </button>
        </p>
      )}
      {!shortcutsOnly && <RemindersCard
        reminders={query.data?.items ?? []}
        timeZone={zone ?? undefined}
        onAdd={
          zone
            ? () =>
                setModal({
                  intent: crypto.randomUUID(),
                  draft: { title: t('tasks.followUp', { name: label }) },
                })
            : undefined
        }
        onEdit={edit}
        onToggle={(row) => {
          const item = query.data?.items.find((i) => i.id === row.id);
          if (item) void actions.toggle(item);
        }}
        onDismiss={(row) => {
          const item = query.data?.items.find((i) => i.id === row.id);
          if (item) void actions.dismiss(item);
        }}
        onDelete={(row) => {
          const item = query.data?.items.find((i) => i.id === row.id);
          if (item) void actions.remove(item);
        }}
      />}
      {modal && zone && (
        <ReminderModal
          initial={modal.draft}
          editing={Boolean(modal.item)}
          relatedLabel={label}
          onClose={() => setModal(null)}
          onSave={async (draft) => {
            const data = {
              ...draft,
              time_zone: zone,
              note: draft.note || null,
            };
            if (modal.item) await actions.update(modal.item, data);
            else
              await actions.create({
                ...data,
                intent_id: modal.intent,
                ...reminderTargetFields(targetType, targetId),
              });
          }}
        />
      )}
    </>
  );
}
