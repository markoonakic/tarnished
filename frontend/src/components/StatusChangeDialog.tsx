import Button from '@/components/ui/Button';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { historyLocalTime, historyInstant } from '@/lib/historyDateTime';
import Modal from './Modal';
import Dropdown from './Dropdown';
export interface StatusChangeOption {
  value: string;
  label: string;
  meaning?: string;
}
export interface StatusChangeDraft {
  status_id: string;
  changed_at: string;
  comment: string;
  reason: string | null;
  applied_at?: string;
}
export interface StatusChangeDialogProps {
  isOpen?: boolean;
  options: StatusChangeOption[];
  statusId: string;
  appliedAt?: string | null;
  timeZone?: string;
  initial?: Partial<StatusChangeDraft>;
  onSave: (draft: StatusChangeDraft) => void | Promise<void>;
  onClose: () => void;
}
const reasons = [
  'noResponse',
  'positionFilled',
  'skillsMismatch',
  'salary',
  'location',
  'acceptedOtherOffer',
  'notInterested',
];
export default function StatusChangeDialog({
  isOpen = true,
  ...props
}: StatusChangeDialogProps) {
  return isOpen ? <StatusChangeForm {...props} /> : null;
}
function StatusChangeForm({
  options,
  statusId,
  appliedAt,
  initial,
  onSave,
  onClose,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: Omit<StatusChangeDialogProps, 'isOpen'>) {
  const { t } = useTranslation();
  const id = useId();
  const [status, setStatus] = useState(initial?.status_id ?? statusId);
  const [time, setTime] = useState(
    historyLocalTime(
      initial?.changed_at ?? new Date().toISOString(),
      timeZone
    ).slice(0, 16)
  );
  const [sentDate, setSentDate] = useState(
    initial?.applied_at ??
      appliedAt ??
      historyLocalTime(new Date().toISOString(), timeZone).slice(0, 10)
  );
  const needsSentDate =
    appliedAt === null &&
    options.find((option) => option.value === status)?.meaning !== 'preparing';
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const terminal = ['rejected', 'withdrawn'].includes(
    options.find((option) => option.value === status)?.meaning ?? ''
  );
  const input =
    'bg-bg2 text-fg1 placeholder:text-fg4 w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent';
  const label = 'text-muted mb-1 block text-sm';
  return (
    <Modal onClose={onClose} labelledBy={id} busy={busy}>
      <form
        className="bg-secondary mx-4 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg p-6 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError('');
          let instant: string;
          try {
            instant = historyInstant(time, timeZone);
          } catch (error) {
            setError((error as Error).message);
            return;
          }
          setBusy(true);
          try {
            await onSave({
              status_id: status,
              ...(needsSentDate ? { applied_at: sentDate } : {}),
              changed_at: instant,
              comment: comment.trim(),
              reason: terminal ? reason.trim() || null : null,
            });
            onClose();
          } catch {
            setError(t('kit.saveFailed'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id={id} className="text-fg1 text-xl font-semibold">
            {t('kit.changeStatus')}
          </h2>
          <Button
            variant="icon"
            type="button"
            disabled={busy}
            aria-label={t('kit.close')}
            onClick={onClose}

            title={t('kit.close')}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </Button>
        </div>
        <fieldset disabled={busy} className="space-y-4">
          <div>
            <label htmlFor={id + '-status'} className={label}>
              {t('kit.newStatus')}
            </label>
            <Dropdown
              id={id + '-status'}
              options={options}
              value={status}
              onChange={setStatus}
            />
          </div>
          {needsSentDate && (
            <div>
              <label htmlFor={id + '-sent'} className={label}>
                {t('records.sentDate')}
              </label>
              <input
                id={id + '-sent'}
                type="date"
                required
                className={input}
                value={sentDate}
                onChange={(e) => setSentDate(e.target.value)}
              />
            </div>
          )}
          <div>
            <label htmlFor={id + '-time'} className={label}>
              {t('kit.dateTime')}
            </label>
            <input
              id={id + '-time'}
              type="datetime-local"
              required
              className={input}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={id + '-comment'} className={label}>
              {t('kit.commentOptional')}
            </label>
            <textarea
              id={id + '-comment'}
              rows={3}
              className={input}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          {terminal && (
            <div>
              <label htmlFor={id + '-reason'} className={label}>
                {t('kit.reason')}
              </label>
              <input
                id={id + '-reason'}
                list={id + '-suggestions'}
                className={input}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <datalist id={id + '-suggestions'}>
                {reasons.map((key) => (
                  <option key={key} value={t('kit.reason.' + key)} />
                ))}
              </datalist>
            </div>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-red mt-4 text-sm">
            {error}
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
              busy ||
              !options.some((option) => option.value === status) ||
              !time ||
              (needsSentDate && !sentDate)
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
