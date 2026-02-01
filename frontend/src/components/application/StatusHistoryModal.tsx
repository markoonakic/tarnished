import { useEffect } from 'react';
import type { ApplicationStatusHistory } from '../../lib/types';

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
      className="fixed inset-0 bg-bg0/80 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-history-title"
    >
      <div className="bg-bg1 rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-primary">
          <h3 id="status-history-title" className="text-lg font-semibold text-primary">Status History</h3>
          <button onClick={onClose} className="text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-2 py-1 rounded cursor-pointer">
            <i className="bi bi-x-lg text-xl" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {!history || history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <i className="bi-clock-history text-5xl text-muted mb-4" aria-hidden="true" />
              <p className="text-sm text-muted">No status changes recorded yet.</p>
              <p className="text-xs text-muted mt-2">History will appear here when you update the application status.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry: ApplicationStatusHistory) => (
                <div
                  key={entry.id}
                  className="bg-tertiary rounded-lg p-4 flex items-start justify-between gap-4"
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
                          <i className="bi-arrow-right text-muted text-xs" />
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
                      <p className="text-sm text-secondary mt-2 whitespace-pre-wrap">{entry.note}</p>
                    )}
                  </div>
                  {isEditing && (
                    <button
                      onClick={() => onDelete(entry.id)}
                      disabled={deleteIsPending}
                      className="bg-transparent text-red hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm disabled:opacity-50 flex-shrink-0 cursor-pointer"
                      title="Delete"
                    >
                      <i className="bi-trash" />
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
