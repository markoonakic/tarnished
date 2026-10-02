import Modal from './Modal';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { convertToApplication, jobLeadError } from '@/lib/jobLeads';
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
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setIsConverting(false);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !lead) return null;

  const handleConvert = async () => {
    setIsConverting(true);
    setError('');

    try {
      const application = await convertToApplication(lead.id);

      onClose();

      if (onConverted) {
        onConverted(application.id);
      } else {
        navigate(`/applications/${application.id}`);
      }
    } catch (err) {
      const failure = jobLeadError(err);
      const errorMessage = `Your job lead is still saved. ${failure.message} Reload the lead before trying again.`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsConverting(false);
    }
  };

  const jobTitle = lead.title || 'Untitled Position';
  const company = lead.company || 'Unknown Company';

  return (
    <Modal
      onClose={onClose}
      labelledBy="convert-modal-title"
      busy={isConverting}
    >
      <div
        className="bg-bg1 mx-4 w-full max-w-md rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
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

        <div className="p-6">
          {error && (
            <p role="alert" className="text-red-bright mb-4">
              {error}
            </p>
          )}
          <p className="text-fg1 mb-2">
            Are you sure you want to convert this job lead to an application?
          </p>
          <div className="bg-bg2 mt-4 rounded-lg p-4">
            <p className="text-primary font-medium">{jobTitle}</p>
            <p className="text-fg1 text-sm">{company}</p>
          </div>
          <p className="text-muted mt-4 text-sm">
            Your saved job details will be copied into the application.
          </p>
        </div>

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
            disabled={
              isConverting ||
              !!error ||
              (!lead.converted_to_application_id &&
                (!lead.company?.trim() || !lead.title?.trim()))
            }
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
    </Modal>
  );
}
