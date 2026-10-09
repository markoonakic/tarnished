import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import RemindersCard, { type ReminderItem } from '../RemindersCard';
import ReminderModal from '../ReminderModal';
import { DeleteConfirm } from './RecordModals';
import { apiV030, type Reminder } from '@/lib/apiV030';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { allPages, failureMessage, actionClass } from './addressBook';

export default function AddressReminders({
  type,
  id,
  name,
}: {
  type: 'company' | 'contact';
  id: string;
  name: string;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const preferences = useUserPreferences();
  const zone =
    preferences.data?.time_zone_mode === 'manual'
      ? (preferences.data.time_zone ?? 'UTC')
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = ['reminders', type, id];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      allPages((page) =>
        apiV030.reminders({
          target_type: type,
          target_id: id,
          per_page: 100,
          page,
        })
      ),
  });
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState('');
  const find = (item: ReminderItem) =>
    query.data?.find((row) => row.id === item.id);
  const refresh = () => client.invalidateQueries({ queryKey: ['reminders'] });
  async function state(
    item: ReminderItem,
    next: 'open' | 'done' | 'dismissed'
  ) {
    const row = find(item);
    if (!row || busy) return;
    setBusy(true);
    try {
      await apiV030.updateReminder(row.id, {
        state: next,
        expected_revision: row.revision,
      });
      await refresh();
      setError('');
    } catch (error) {
      setError(failureMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const dateTime = (row: Reminder) => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(row.due_at));
    const part = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? '';
    return {
      due_date: part('year') + '-' + part('month') + '-' + part('day'),
      due_time: part('hour') + ':' + part('minute'),
    };
  };
  return (
    <>
      <RemindersCard
        reminders={query.data ?? []}
        timeZone={zone}
        onAdd={() => {
          setIntent(crypto.randomUUID());
          setEditing('new');
        }}
        onEdit={(item) => setEditing(find(item) ?? null)}
        onToggle={
          busy
            ? undefined
            : (item) =>
                void state(item, item.state === 'open' ? 'done' : 'open')
        }
        onDismiss={(item) => void state(item, 'dismissed')}
        onDelete={(item) => setDeleting(find(item) ?? null)}
      />
      {(error || query.isError) && (
        <p role="alert" className="text-red mb-4">
          {error || failureMessage(query.error)}
          <button className={actionClass} onClick={() => void query.refetch()}>
            <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
            {t('companies.reload')}
          </button>
        </p>
      )}
      {editing && (
        <ReminderModal
          editing={editing !== 'new'}
          relatedLabel={name}
          initial={
            editing === 'new'
              ? { title: t('companies.followUp', { name }) }
              : {
                  kind: editing.kind,
                  title: editing.title,
                  note: editing.note ?? '',
                  ...dateTime(editing),
                }
          }
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const data = { ...draft, time_zone: zone };
            if (editing === 'new')
              await apiV030.createReminder({
                ...data,
                intent_id: intent,
                [type + '_id']: id,
              });
            else
              await apiV030.updateReminder(editing.id, {
                ...data,
                expected_revision: editing.revision,
              });
            await refresh();
          }}
        />
      )}
      {deleting && (
        <DeleteConfirm
          message={t('companies.deleteReminder')}
          onClose={() => setDeleting(null)}
          onDelete={async () => {
            await apiV030.deleteReminder(deleting.id, deleting.revision);
            await refresh();
          }}
        />
      )}
    </>
  );
}
