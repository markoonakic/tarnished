import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import Modal from '../Modal';
import HistoryEvidenceDetails from './HistoryEvidenceDetails';
import HistoryEntrySummary from './HistoryEntrySummary';
import EvidenceSummary from './EvidenceSummary';
import type { Application, ApplicationStatusHistory } from '../../lib/types';

interface Props {
  application?: Application;
  applicationId: string;
  revision?: number;
  onChanged?: () => void | Promise<void>;
  isOpen: boolean;
  onClose: () => void;
  history: ApplicationStatusHistory[];
  isEditing: boolean;
  onToggleEditing: () => void;
  onDelete: (historyId: string) => void;
  deleteIsPending: boolean;
  deleteError?: string;
}
export default function StatusHistoryModal({
  application,
  applicationId,
  revision,
  onChanged,
  isOpen,
  onClose,
  history,
  isEditing,
  onToggleEditing,
  onDelete,
  deleteIsPending,
  deleteError,
}: Props) {
  useTranslation();
  if (!isOpen) return null;
  return (
    <Modal onClose={onClose} labelledBy="status-history-title">
      <div
        className="bg-bg1 mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-tertiary flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b p-4">
          <h3
            id="status-history-title"
            className="text-primary text-lg font-semibold"
          >
            {t('Status History')}
          </h3>
          <div className="flex items-center gap-2">
            {!!history.length && (
              <Button type="button" onClick={onToggleEditing}>
                {isEditing ? t('Done') : t('Edit History')}
              </Button>
            )}
            <Button
              variant="icon"
              aria-label={t('Close history')}
              onClick={onClose}
            >
              <i className="bi-x-lg icon-xl" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {isEditing && application && onChanged && (
            <EvidenceSummary application={application} onChanged={onChanged} />
          )}
          {deleteError && (
            <p role="alert" className="text-red-bright mb-4">
              {deleteError}
            </p>
          )}
          {!history.length ? (
            <p className="text-muted py-12 text-center text-sm">
              {t('No status changes recorded yet.')}
            </p>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className="bg-bg2 flex flex-wrap items-start justify-between gap-3 rounded-lg p-4"
              >
                <div className="min-w-0 flex-1">
                  <HistoryEntrySummary entry={entry} />
                  <HistoryEvidenceDetails
                    entry={entry}
                    applicationId={applicationId}
                    revision={revision}
                    onChanged={onChanged}
                    editable
                  />
                </div>
                {isEditing && !entry.is_gap && (
                  <Button
                    variant="danger"
                    onClick={() => onDelete(entry.id)}
                    disabled={deleteIsPending}
                    className="flex items-center gap-1.5"
                  >
                    <i className="bi-trash icon-xs" aria-hidden="true" />
                    {t('Delete')}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
