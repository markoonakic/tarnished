import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiV030, type Reminder, type TargetType } from '@/lib/apiV030';
import { locale } from '@/lib/i18n';
import { errorMessage } from '@/lib/errorMessage';
import ReminderModal from '../ReminderModal';

export default function DeadlineReminder({
  id,
  type,
  deadline,
  title,
  onUpdated,
}: {
  id: string;
  type: Extract<TargetType, 'lead' | 'application'>;
  deadline: string;
  title: string;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<Reminder>();
  const [error, setError] = useState('');
  const [intent, setIntent] = useState('');
  useEffect(() => {
    let current = true;
    apiV030
      .reminders({
        target_type: type,
        target_id: id,
        kind: 'application_deadline',
        state: 'open',
      })
      .then((data) => {
        if (current) setExisting(data.items[0]);
      })
      .catch(() => {
        /* The click retries the lookup before creating. */
      });
    return () => {
      current = false;
    };
  }, [id, type, deadline]);
  return (
    <>
      <button
        type="button"
        className="text-muted hover:text-fg1 hover:bg-bg2 focus:ring-accent ml-2 cursor-pointer rounded p-1.5 transition-all duration-200 ease-in-out focus:ring-2"
        aria-label={t('records.remindMe')}
        onClick={async () => {
          setError('');
          try {
            const data = await apiV030.reminders({
              target_type: type,
              target_id: id,
              kind: 'application_deadline',
              state: 'open',
            });
            setExisting(data.items[0]);
            setIntent(crypto.randomUUID());
            setOpen(true);
          } catch (error) {
            setError(errorMessage(error));
          }
        }}
        title={t('records.remindMe')}
      >
        <i
          className={existing ? 'bi-alarm-fill' : 'bi-alarm'}
          aria-hidden="true"
        />
      </button>
      {error && (
        <p role="alert" className="text-red text-xs">
          {error}
        </p>
      )}
      {open && (
        <ReminderModal
          editing={!!existing}
          relatedLabel={title}
          initial={{
            kind: 'application_deadline',
            title: existing?.title || t('records.deadlineFor', { title }),
            due_date: existing
              ? new Intl.DateTimeFormat('en-CA', {
                  timeZone: existing.time_zone,
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }).format(new Date(existing.due_at))
              : deadline,
            due_time: existing
              ? new Date(existing.due_at).toLocaleTimeString(locale(), {
                  timeZone: existing.time_zone,
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
              : '09:00',
            note: existing?.note || '',
          }}
          onClose={() => setOpen(false)}
          onSave={async (draft) => {
            const saved = existing
              ? await apiV030.updateReminder(existing.id, {
                  ...draft,
                  time_zone: existing.time_zone,
                  expected_revision: existing.revision,
                })
              : await apiV030.createReminder({
                  ...draft,
                  intent_id: intent,
                  [`${type}_id`]: id,
                });
            setExisting(saved);
            onUpdated?.();
          }}
        />
      )}
    </>
  );
}
