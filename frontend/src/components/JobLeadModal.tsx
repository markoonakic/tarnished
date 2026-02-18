import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ConvertToApplicationModal from './ConvertToApplicationModal';
import type { JobLead } from '@/lib/types';

interface JobLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: JobLead | null;
  onConvert?: (id: string) => void;
  onDelete?: (id: string) => void;
}

// Status badge colors
const statusColors: Record<string, string> = {
  pending: 'bg-[var(--color-orange)]/20 text-[var(--color-orange)]',
  extracted: 'bg-[var(--color-green)]/20 text-[var(--color-green)]',
  failed: 'bg-[var(--color-red)]/20 text-[var(--color-red)]',
};

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null
): string | null {
  if (min === null && max === null) return null;

  const curr = currency || 'USD';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: curr,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  if (min !== null && max !== null) {
    return `${formatter.format(min)} - ${formatter.format(max)}`;
  } else if (min !== null) {
    return `From ${formatter.format(min)}`;
  } else if (max !== null) {
    return `Up to ${formatter.format(max)}`;
  }
  return null;
}

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

export default function JobLeadModal({
  isOpen,
  onClose,
  lead,
  onConvert,
  onDelete,
}: JobLeadModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  // Escape key handler
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (showDeleteConfirm) {
            setShowDeleteConfirm(false);
          } else if (showConvertModal) {
            setShowConvertModal(false);
          } else {
            onClose();
          }
        }
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose, showDeleteConfirm, showConvertModal]);

  // Reset confirmation modals when main modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
      setShowConvertModal(false);
    }
  }, [isOpen]);

  if (!isOpen || !lead) return null;

  const salaryDisplay = formatSalary(
    lead.salary_min,
    lead.salary_max,
    lead.salary_currency
  );

  const postedDateDisplay = formatDate(lead.posted_date);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleDeleteClick() {
    setShowDeleteConfirm(true);
  }

  function handleConfirmDelete() {
    if (onDelete && lead) {
      onDelete(lead.id);
    }
    setShowDeleteConfirm(false);
    onClose();
  }

  function handleCancelDelete() {
    setShowDeleteConfirm(false);
  }

  function handleConvertClick() {
    setShowConvertModal(true);
  }

  function handleConverted(_applicationId: string) {
    if (onConvert && lead) {
      onConvert(lead.id);
    }
    setShowConvertModal(false);
  }

  return (
    <div
      className="fixed inset-0 bg-bg0/80 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          handleOverlayClick(e as unknown as React.MouseEvent);
        }
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="bg-bg1 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex justify-between items-start p-4 border-b border-tertiary">
          <div className="flex-1 pr-4">
            <h3 id="modal-title" className="text-primary font-medium text-lg">
              {lead.title || 'Untitled Position'}
            </h3>
            {lead.company && (
              <p className="text-fg1 mt-1">{lead.company}</p>
            )}
            <div className="mt-2">
              <span
                className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                  statusColors[lead.status] || statusColors.pending
                }`}
              >
                {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out p-2 rounded cursor-pointer flex-shrink-0"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Basic Info */}
          <div className="bg-bg2 rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {lead.location && (
                <div>
                  <span className="text-muted block mb-1">Location</span>
                  <span className="text-fg1">{lead.location}</span>
                </div>
              )}
              {salaryDisplay && (
                <div>
                  <span className="text-muted block mb-1">Salary</span>
                  <span className="text-fg1">{salaryDisplay}</span>
                </div>
              )}
              {lead.source && (
                <div>
                  <span className="text-muted block mb-1">Source</span>
                  <span className="text-fg1">{lead.source}</span>
                </div>
              )}
              {postedDateDisplay && (
                <div>
                  <span className="text-muted block mb-1">Posted Date</span>
                  <span className="text-fg1">{postedDateDisplay}</span>
                </div>
              )}
              {(lead.years_experience_min !== null || lead.years_experience_max !== null) && (
                <div>
                  <span className="text-muted block mb-1">Experience</span>
                  <span className="text-fg1">
                    {lead.years_experience_min !== null && lead.years_experience_max !== null
                      ? `${lead.years_experience_min} - ${lead.years_experience_max} years`
                      : lead.years_experience_min !== null
                      ? `${lead.years_experience_min}+ years`
                      : `Up to ${lead.years_experience_max} years`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {lead.description && (
            <div className="bg-bg2 rounded-lg p-4">
              <h4 className="text-muted text-sm font-semibold mb-3">Description</h4>
              <div className="prose prose-invert max-w-none text-fg1 prose-p:text-fg1 prose-headings:text-fg1 prose-p:my-2 prose-headings:my-3">
                <ReactMarkdown>{lead.description}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Recruiter Info */}
          {lead.recruiter_name && (
            <div className="bg-bg2 rounded-lg p-4">
              <h4 className="text-muted text-sm font-semibold mb-3">Recruiter</h4>
              <div className="space-y-1">
                <p className="text-fg1 font-medium">{lead.recruiter_name}</p>
                {lead.recruiter_title && (
                  <p className="text-muted text-sm">{lead.recruiter_title}</p>
                )}
                {lead.recruiter_linkedin_url && (
                  <a
                    href={lead.recruiter_linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-aqua hover:text-aqua-bright transition-all duration-200 ease-in-out text-sm inline-flex items-center gap-1 cursor-pointer"
                  >
                    <i className="bi bi-linkedin icon-sm" />
                    LinkedIn Profile
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Requirements */}
          {(lead.requirements_must_have.length > 0 || lead.requirements_nice_to_have.length > 0) && (
            <div className="bg-bg2 rounded-lg p-4">
              <h4 className="text-muted text-sm font-semibold mb-3">Requirements</h4>
              <div className="space-y-4">
                {lead.requirements_must_have.length > 0 && (
                  <div>
                    <p className="text-fg1 text-sm font-medium mb-2 flex items-center gap-2">
                      <i className="bi bi-asterisk icon-xs text-red" />
                      Must Have
                    </p>
                    <ul className="list-disc list-inside text-fg1 text-sm space-y-1">
                      {lead.requirements_must_have.map((req, index) => (
                        <li key={index}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {lead.requirements_nice_to_have.length > 0 && (
                  <div>
                    <p className="text-fg1 text-sm font-medium mb-2 flex items-center gap-2">
                      <i className="bi bi-star icon-xs text-yellow" />
                      Nice to Have
                    </p>
                    <ul className="list-disc list-inside text-fg1 text-sm space-y-1">
                      {lead.requirements_nice_to_have.map((req, index) => (
                        <li key={index}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Skills */}
          {lead.skills.length > 0 && (
            <div className="bg-bg2 rounded-lg p-4">
              <h4 className="text-muted text-sm font-semibold mb-3">Skills</h4>
              <div className="flex flex-wrap gap-2">
                {lead.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="bg-bg3 text-fg1 px-2 py-1 rounded text-sm"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error Message (if failed) */}
          {lead.status === 'failed' && lead.error_message && (
            <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded">
              <p className="text-sm font-medium">Error</p>
              <p className="text-sm">{lead.error_message}</p>
            </div>
          )}

          {/* Converted Application Link */}
          {lead.converted_to_application_id && (
            <div className="bg-green-bright/20 border border-green-bright text-green-bright px-4 py-3 rounded">
              <p className="text-sm flex items-center gap-2">
                <i className="bi bi-check-circle icon-sm" />
                Converted to application
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row justify-between sm:items-center gap-3 p-4 border-t border-tertiary">
          <div className="flex gap-2">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-fg1 text-sm">Delete this job lead?</span>
                <button
                  onClick={handleConfirmDelete}
                  className="bg-red text-bg0 hover:bg-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded text-sm font-medium cursor-pointer"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={handleCancelDelete}
                  className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded text-sm cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {lead.converted_to_application_id === null && onConvert && (
                  <button
                    onClick={handleConvertClick}
                    className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <i className="bi bi-arrow-repeat icon-sm" />
                    Convert to Application
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={handleDeleteClick}
                    className="bg-transparent text-red hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <i className="bi bi-trash icon-sm" />
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <a
              href={lead.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-aqua text-bg0 hover:bg-aqua-bright transition-all duration-200 ease-in-out px-4 py-2 rounded font-medium text-sm flex items-center gap-1.5 cursor-pointer"
            >
              <i className="bi bi-box-arrow-up-right icon-sm" />
              Open Job Page
            </a>
          </div>
        </div>
      </div>

      {/* Convert to Application Modal */}
      <ConvertToApplicationModal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        lead={lead}
        onConverted={handleConverted}
      />
    </div>
  );
}
