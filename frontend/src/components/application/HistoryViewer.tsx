import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApplicationHistory, deleteHistoryEntry } from '../../lib/history';
import type { ApplicationStatusHistory } from '../../lib/types';
import StatusHistoryModal from './StatusHistoryModal';

interface Props {
  applicationId: string;
}

export default function HistoryViewer({ applicationId }: Props) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: history, isLoading, error } = useQuery({
    queryKey: ['application-history', applicationId],
    queryFn: () => getApplicationHistory(applicationId),
  });

  const deleteMutation = useMutation({
    mutationFn: (historyId: string) => deleteHistoryEntry(applicationId, historyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-history', applicationId] });
    },
  });

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  function handleDelete(historyId: string) {
    if (!confirm('Delete this history entry?')) return;
    deleteMutation.mutate(historyId);
  }

  if (isLoading) {
    return (
      <div className="bg-bg1 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-primary mb-4">Status History</h2>
        <div className="flex items-center justify-center py-8">
          <div className="text-muted">Loading history...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-bg1 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-primary mb-4">Status History</h2>
        <div className="text-accent-red">Failed to load history</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-bg1 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-primary">Status History</h2>
          <div className="flex gap-2">
            {history && history.length > 0 && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium ${
                  isEditing
                    ? 'bg-aqua text-bg0 hover:bg-aqua-bright'
                    : 'bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0'
                }`}
              >
                {isEditing ? 'Done' : 'Edit History'}
              </button>
            )}
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!history || history.length === 0}
              className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              View All History
            </button>
          </div>
        </div>

        {!history || history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <i className="bi-clock-history icon-2xl text-muted mb-4" aria-hidden="true" />
            <p className="text-sm text-muted">No status changes recorded yet.</p>
            <p className="text-xs text-muted mt-2">History will appear here when you update the application status.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.slice(0, 3).map((entry: ApplicationStatusHistory) => (
              <div
                key={entry.id}
                className="bg-bg2 rounded-lg p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {entry.from_status ? (
                      <>
                        <span
                          className="text-xs px-2 py-1 rounded font-medium"
                          style={{
                            backgroundColor: `${entry.from_status.color}20`,
                            color: entry.from_status.color,
                          }}
                        >
                          {entry.from_status.name}
                        </span>
                        <i className="bi-arrow-right text-muted icon-xs" />
                      </>
                    ) : (
                      <span className="text-xs text-muted italic">New</span>
                    )}
                    <span
                      className="text-xs px-2 py-1 rounded font-medium"
                      style={{
                        backgroundColor: `${entry.to_status.color}20`,
                        color: entry.to_status.color,
                      }}
                    >
                      {entry.to_status.name}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {formatDateTime(entry.changed_at)}
                  </p>
                  {entry.note && (
                    <p className="text-sm text-fg1 mt-2 whitespace-pre-wrap">{entry.note}</p>
                  )}
                </div>
                {isEditing && (
                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={deleteMutation.isPending}
                    className="bg-transparent text-red hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-xs disabled:opacity-50 flex-shrink-0 cursor-pointer"
                    title="Delete"
                  >
                    <i className="bi-trash icon-xs"></i>
                    Delete
                  </button>
                )}
              </div>
            ))}
            {history.length > 3 && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-muted hover:text-fg0 hover:bg-bg2 transition-all duration-200 ease-in-out px-2 py-1 rounded text-sm cursor-pointer"
                >
                  View {history.length - 3} more entr{history.length - 3 === 1 ? 'y' : 'ies'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <StatusHistoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        history={history || []}
        isEditing={isEditing}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
      />
    </>
  );
}
