import Button from '@/components/ui/Button';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import Dropdown from './Dropdown';
import { reminderKinds, type ReminderKind } from '@/lib/uiPills';
export interface ReminderDraft {
  kind: ReminderKind;
  title: string;
  due_date: string;
  due_time: string;
  note: string;
}
export interface ReminderModalProps {
  isOpen?: boolean;
  initial?: Partial<ReminderDraft>;
  editing?: boolean;
  relatedLabel?: string;
  relatedPicker?: ReactNode;
  onSave: (draft: ReminderDraft) => void | Promise<void>;
  onClose: () => void;
}
export default function ReminderModal({
  isOpen = true,
  ...props
}: ReminderModalProps) {
  return isOpen ? <ReminderForm {...props} /> : null;
}
function ReminderForm({
  initial,
  editing,
  relatedLabel,
  relatedPicker,
  onSave,
  onClose,
}: Omit<ReminderModalProps, 'isOpen'>) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState<ReminderDraft>({
    kind: 'recruiter_follow_up',
    title: '',
    due_date: '',
    due_time: '09:00',
    note: '',
    ...initial,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [baseline] = useState(() => JSON.stringify(draft));
  useUnsavedChanges(busy || JSON.stringify(draft) !== baseline);
  const input =
    'bg-bg2 text-fg1 placeholder:text-fg4 w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent';
  const label = 'text-muted mb-1 block text-sm';
  return (
    <Modal onClose={onClose} labelledBy={id} busy={busy}>
      <form
        className="bg-secondary mx-4 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg p-6 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !draft.title.trim() || !draft.due_date || !draft.due_time)
            return;
          setBusy(true);
          setError(false);
          try {
            await onSave({
              ...draft,
              title: draft.title.trim(),
              note: draft.note.trim(),
            });
            onClose();
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id={id} className="text-fg1 text-xl font-semibold">
            {t(editing ? 'kit.editReminder' : 'kit.addReminder')}
          </h2>
          <Button
            variant="icon"
            type="button"
            aria-label={t('kit.close')}
            disabled={busy}
            onClick={onClose}

            title={t('kit.close')}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </Button>
        </div>
        <fieldset disabled={busy} className="space-y-4">
          <div>
            <label htmlFor={id + '-kind'} className={label}>
              {t('kit.kind')}
            </label>
            <Dropdown
              id={id + '-kind'}
              value={draft.kind}
              options={Object.entries(reminderKinds).map(([value, kind]) => ({
                value,
                label: t('kit.kind.' + value),
                icon: kind.icon,
              }))}
              onChange={(kind) =>
                setDraft({ ...draft, kind: kind as ReminderKind })
              }
            />
          </div>
          <div>
            <label htmlFor={id + '-title'} className={label}>
              {t('kit.title')}
            </label>
            <input
              id={id + '-title'}
              required
              maxLength={255}
              className={input}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={id + '-date'} className={label}>
                {t('kit.date')}
              </label>
              <input
                id={id + '-date'}
                type="date"
                required
                className={input}
                value={draft.due_date}
                onChange={(e) =>
                  setDraft({ ...draft, due_date: e.target.value })
                }
              />
            </div>
            <div>
              <label htmlFor={id + '-time'} className={label}>
                {t('kit.time')}
              </label>
              <input
                id={id + '-time'}
                type="time"
                required
                className={input}
                value={draft.due_time}
                onChange={(e) =>
                  setDraft({ ...draft, due_time: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label htmlFor={id + '-note'} className={label}>
              {t('kit.noteOptional')}
            </label>
            <textarea
              id={id + '-note'}
              rows={3}
              className={input}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
          {relatedLabel && (
            <p className="text-fg4 text-xs">
              {t('kit.forRecord', { record: relatedLabel })}
            </p>
          )}
          {!relatedLabel && relatedPicker && (
            <div>
              <span className={label}>{t('kit.relatedTo')}</span>
              {relatedPicker}
            </div>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-red mt-4 text-sm">
            {t('kit.saveFailed')}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex items-center gap-1.5"
          >
            <i className="bi-x-lg icon-sm" aria-hidden="true" />
            {t('kit.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={
              busy || !draft.title.trim() || !draft.due_date || !draft.due_time
            }
            className="flex items-center gap-1.5"
          >
            <i className="bi-check2 icon-sm" aria-hidden="true" />
            {t('kit.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
