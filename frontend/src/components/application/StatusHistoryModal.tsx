import { useEffect } from 'react';
import type { ApplicationStatusHistory } from '../../lib/types';
import { getStatusColor } from '../../lib/statusColors';
import { useThemeColors } from '../../hooks/useThemeColors';

interface StatusHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: ApplicationStatusHistory[];
  isEditing: boolean;
  onDelete: (historyId: string) => void;
  deleteIsPending: boolean;
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString();
}

export default function StatusHistoryModal({
  isOpen,
  onClose,
  history,
  isEditing,
  onDelete,
  deleteIsPending,
}: StatusHistoryModalProps) {
  const colors = useThemeColors();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="bg-bg0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-history-title"
    >
      <div
        className="bg-bg1 mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex flex-shrink-0 items-center justify-between border-b p-4">
          <h3
            id="status-history-title"
            className="text-primary text-lg font-semibold"
          >
            Status History
          </h3>
          <button
            onClick={onClose}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded p-2 transition-all duration-200 ease-in-out"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
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
              {history.map((entry: ApplicationStatusHistory) => (
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
                      <p className="text-secondary mt-2 whitespace-pre-wrap text-sm">
                        {entry.note}
                      </p>
                    )}
                  </div>
                  {isEditing && (
                    <button
                      onClick={() => onDelete(entry.id)}
                      disabled={deleteIsPending}
                      className="text-red hover:bg-bg3 hover:text-red-bright flex cursor-pointer items-center gap-1.5 self-center rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50"
                      title="Delete"
                    >
                      <i className="bi-trash icon-xs" />
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
