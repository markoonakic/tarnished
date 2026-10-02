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
    ? 'Deletion failed. Reload if evidence changed before retrying.'
    : '';
  function handleDelete(historyId: string) {
    if (
      confirm(
        'Delete this history entry? Its content is removed and the history keeps a gap.'
      )
    )
      deleteMutation.mutate(historyId);
  }
  return (
    <>
      <div id="application-history" className="bg-bg1 rounded-lg p-6">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="text-primary text-lg font-semibold">Status History</h2>
          <div className="flex gap-2">
            {!!history?.length && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`cursor-pointer rounded-md px-4 py-2 font-medium transition-colors ${isEditing ? 'bg-accent text-bg0 hover:bg-accent-bright' : 'text-fg1 hover:bg-bg2'}`}
              >
                {isEditing ? 'Done' : 'Edit History'}
              </button>
            )}
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!history?.length}
              className="text-fg1 hover:bg-bg2 cursor-pointer rounded-md px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              View All History
            </button>
          </div>
        </div>
        {isLoading ? (
          <p role="status" className="text-muted py-8 text-center">
            Loading history…
          </p>
        ) : error ? (
          <p role="alert" className="text-red-bright">
            Failed to load history
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
                  No status changes recorded yet.
                </p>
                <p className="text-muted mt-2 text-xs">
                  History will appear here when you update the application
                  status.
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
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleteMutation.isPending}
                        className="text-red hover:bg-bg3 hover:text-red-bright flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        <i className="bi-trash icon-xs" aria-hidden="true" />
                        Delete
                      </button>
                    )}
                  </div>
                ))}
                {history.length > 3 && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="text-muted hover:text-fg0 hover:bg-bg2 cursor-pointer rounded px-2 py-1 text-sm"
                    >
                      View {history.length - 3} more
                    </button>
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
