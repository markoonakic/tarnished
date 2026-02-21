import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { convertToApplication } from '@/lib/jobLeads';
import { useToast } from '@/hooks/useToast';
import type { JobLead } from '@/lib/types';

interface ConvertToApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: JobLead | null;
  onConverted?: (applicationId: string) => void;
}

export default function ConvertToApplicationModal({
  isOpen,
  onClose,
  lead,
  onConverted,
}: ConvertToApplicationModalProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [isConverting, setIsConverting] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsConverting(false);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isConverting) {
          onClose();
        }
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isConverting, onClose]);

  if (!isOpen || !lead) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isConverting) {
      onClose();
    }
  };

  const handleConvert = async () => {
    setIsConverting(true);

    try {
      const application = await convertToApplication(lead.id);

      // Close modal
      onClose();

      // Call callback if provided (parent handles toast and navigation)
      if (onConverted) {
        onConverted(application.id);
      } else {
        // If no callback, navigate directly
        navigate(`/applications/${application.id}`);
      }
    } catch (err) {
      // Handle the case where backend endpoint is not implemented
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to convert job lead';

      if (errorMessage.includes('not yet implemented')) {
        toast.warning(
          'This feature is coming soon. The backend endpoint is not yet available.'
        );
      } else {
        toast.error(errorMessage);
      }
      // Keep modal open on error
    } finally {
      setIsConverting(false);
    }
  };

  const jobTitle = lead.title || 'Untitled Position';
  const company = lead.company || 'Unknown Company';

  return (
    <div
      className="bg-bg0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleOverlayClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          handleOverlayClick(e as unknown as React.MouseEvent);
        }
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="convert-modal-title"
    >
      <div
        className="bg-bg1 mx-4 w-full max-w-md rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-tertiary flex items-center justify-between border-b p-4">
          <h3
            id="convert-modal-title"
            className="text-primary flex items-center gap-2 font-medium"
          >
            <i className="bi bi-arrow-repeat icon-md text-aqua" />
            Convert to Application
          </h3>
          <button
            onClick={onClose}
            disabled={isConverting}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded p-2 transition-all duration-200 ease-in-out disabled:opacity-50"
          >
            <i className="bi bi-x-lg icon-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-fg1 mb-2">
            Are you sure you want to convert this job lead to an application?
          </p>
          <div className="bg-bg2 mt-4 rounded-lg p-4">
            <p className="text-primary font-medium">{jobTitle}</p>
            <p className="text-fg1 text-sm">{company}</p>
          </div>
          <p className="text-muted mt-4 text-sm">
            This will create a new application and remove this lead from your
            leads list.
          </p>
        </div>

        {/* Footer */}
        <div className="border-tertiary flex justify-end gap-3 border-t p-4">
          <button
            onClick={onClose}
            disabled={isConverting}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded bg-transparent px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={isConverting}
            className="bg-aqua text-bg0 hover:bg-aqua-bright flex cursor-pointer items-center gap-2 rounded px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
          >
            {isConverting ? (
              <>
                <i className="bi bi-arrow-repeat icon-sm animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <i className="bi bi-arrow-repeat icon-sm" />
                Convert to Application
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
