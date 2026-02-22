import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApplicationHistory, deleteHistoryEntry } from '../../lib/history';
import type { ApplicationStatusHistory } from '../../lib/types';
import { getStatusColor } from '../../lib/statusColors';
import { useThemeColors } from '../../hooks/useThemeColors';
import StatusHistoryModal from './StatusHistoryModal';

interface Props {
  applicationId: string;
}

export default function HistoryViewer({ applicationId }: Props) {
  const queryClient = useQueryClient();
  const colors = useThemeColors();
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
      deleteHistoryEntry(applicationId, historyId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['application-history', applicationId],
      });
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
        <h2 className="text-primary mb-4 text-lg font-semibold">
          Status History
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="text-muted">Loading history...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-bg1 rounded-lg p-6">
        <h2 className="text-primary mb-4 text-lg font-semibold">
          Status History
        </h2>
        <div className="text-red-bright">Failed to load history</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-bg1 rounded-lg p-6">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="text-primary text-lg font-semibold">Status History</h2>
          <div className="flex gap-2">
            {history && history.length > 0 && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out ${
                  isEditing
                    ? 'bg-accent text-bg0 hover:bg-accent-bright'
                    : 'text-fg1 hover:bg-bg2 hover:text-fg0 bg-transparent'
                }`}
              >
                {isEditing ? 'Done' : 'Edit History'}
              </button>
            )}
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!history || history.length === 0}
              className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded-md bg-transparent px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
            >
              View All History
            </button>
          </div>
        </div>

        {!history || history.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <i
              className="bi-clock-history icon-2xl text-muted mb-4"
              aria-hidden="true"
            />
            <p className="text-muted text-sm">
              No status changes recorded yet.
            </p>
            <p className="text-muted mt-2 text-xs">
              History will appear here when you update the application status.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.slice(0, 3).map((entry: ApplicationStatusHistory) => (
              <div
                key={entry.id}
                className="bg-bg2 flex items-start justify-between gap-4 rounded-lg p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {entry.from_status && (
                      <>
                        <span
                          className="rounded px-2 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${getStatusColor(entry.from_status.name, colors, entry.from_status.color)}20`,
                            color: getStatusColor(
                              entry.from_status.name,
                              colors,
                              entry.from_status.color
                            ),
                          }}
                        >
                          {entry.from_status.name}
                        </span>
                        <i className="bi-arrow-right text-muted icon-xs" />
                      </>
                    )}
                    <span
                      className="rounded px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: `${getStatusColor(entry.to_status.name, colors, entry.to_status.color)}20`,
                        color: getStatusColor(
                          entry.to_status.name,
                          colors,
                          entry.to_status.color
                        ),
                      }}
                    >
                      {entry.to_status.name}
                    </span>
                  </div>
                  <p className="text-muted text-xs">
                    {formatDateTime(entry.changed_at)}
                  </p>
                  {entry.note && (
                    <p className="text-fg1 mt-2 text-sm whitespace-pre-wrap">
                      {entry.note}
                    </p>
                  )}
                </div>
                {isEditing && (
                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={deleteMutation.isPending}
                    className="text-red hover:bg-bg3 hover:text-red-bright flex cursor-pointer items-center gap-1.5 self-center rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50"
                    title="Delete"
                  >
                    <i className="bi-trash icon-xs"></i>
                    Delete
                  </button>
                )}
              </div>
            ))}
            {history.length > 3 && (
              <div className="pt-2 text-center">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-muted hover:text-fg0 hover:bg-bg2 cursor-pointer rounded px-2 py-1 text-sm transition-all duration-200 ease-in-out"
                >
                  View {history.length - 3} more entr
                  {history.length - 3 === 1 ? 'y' : 'ies'}
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
