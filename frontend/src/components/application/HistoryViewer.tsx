import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApplicationHistory, deleteHistoryEntry } from '../../lib/history';
import type { Application } from '../../lib/types';
import StatusHistoryModal from './StatusHistoryModal';
import HistoryEvidenceDetails from './HistoryEvidenceDetails';
import HistoryEntrySummary from './HistoryEntrySummary';

interface Props {
  application?: Application;
  applicationId: string;
  revision?: number;
  onChanged?: () => void | Promise<void>;
}
export default function HistoryViewer({
  application,
  applicationId,
  revision,
  onChanged,
}: Props) {
  useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    data: history,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['application-history', applicationId],
    queryFn: () => getApplicationHistory(applicationId),
  });
  const deleteMutation = useMutation({
    mutationFn: (historyId: string) =>
      deleteHistoryEntry(applicationId, historyId, revision),
    onSuccess: () => {
      void onChanged?.();
      void queryClient.invalidateQueries({
        queryKey: ['application-history', applicationId],
      });
    },
  });
  const deleteError = deleteMutation.isError
    ? t('Deletion failed. Reload if evidence changed before retrying.')
    : '';
  function handleDelete(historyId: string) {
    if (
      confirm(
        t(
          'Delete this history entry? Its content is removed and the history keeps a gap.'
        )
      )
    )
      deleteMutation.mutate(historyId);
  }
  return (
    <>
      <div id="application-history" className="bg-bg1 rounded-lg p-6">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="text-primary text-lg font-semibold">
            {t('Status History')}
          </h2>
          <div className="flex gap-2">
            {!!history?.length && (
              <Button
                variant="primary"
                onClick={() => setIsEditing(!isEditing)}
                className={` ${isEditing ? '' : ''} `}
              >
                {isEditing ? t('Done') : t('Edit History')}
              </Button>
            )}
            <Button
              onClick={() => setIsModalOpen(true)}
              disabled={!history?.length}
            >
              {t('View All History')}
            </Button>
          </div>
        </div>
        {isLoading ? (
          <p role="status" className="text-muted py-8 text-center">
            {t('Loading history…')}
          </p>
        ) : error ? (
          <p role="alert" className="text-red-bright">
            {t('Failed to load history')}
          </p>
        ) : (
          <>
            {deleteError && !isModalOpen && (
              <p role="alert" className="text-red-bright">
                {deleteError}
              </p>
            )}
            {!history?.length ? (
              <div className="px-4 py-12 text-center">
                <i
                  className="bi-clock-history icon-2xl text-muted mb-4"
                  aria-hidden="true"
                />
                <p className="text-muted text-sm">
                  {t('No status changes recorded yet.')}
                </p>
                <p className="text-muted mt-2 text-xs">
                  {t(
                    'History will appear here when you update the application status.'
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.slice(0, 3).map((entry) => (
                  <div
                    key={entry.id}
                    id={`history-${entry.id}`}
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
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleteMutation.isPending}
                        className="flex items-center gap-1.5"
                      >
                        <i className="bi-trash icon-xs" aria-hidden="true" />
                        {t('Delete')}
                      </Button>
                    )}
                  </div>
                ))}
                {history.length > 3 && (
                  <div className="pt-2 text-center">
                    <Button onClick={() => setIsModalOpen(true)}>
                      {t('View {{count}} more', { count: history.length - 3 })}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <StatusHistoryModal
        application={application}
        applicationId={applicationId}
        revision={revision}
        onChanged={onChanged}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        history={history || []}
        isEditing={isEditing}
        onToggleEditing={() => setIsEditing(!isEditing)}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
        deleteError={deleteError}
      />
    </>
  );
}
