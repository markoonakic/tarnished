import Button from '@/components/ui/Button';
import HelpTip from './HelpTip';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
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
  useTranslation();
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
      const errorMessage = t(
        'Your job lead is still saved. {{message}} Reload the lead before trying again.',
        { message: failure.message }
      );
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsConverting(false);
    }
  };

  const jobTitle = lead.title || t('Untitled Position');
  const company = lead.company || t('Unknown Company');

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
            {t('Convert to Application')}
            <HelpTip label={t('About lead conversion')}>
              {t('Your saved job details will be copied into the application.')}
            </HelpTip>
          </h3>
          <Button
            variant="icon"
            onClick={onClose}
            disabled={isConverting}
            aria-label={t('Close modal')}
          >
            <i className="bi bi-x-lg icon-lg" />
          </Button>
        </div>

        <div className="p-6">
          {error && (
            <p role="alert" className="text-red-bright mb-4">
              {error}
            </p>
          )}
          <p className="text-fg1 mb-2">
            {t(
              'Are you sure you want to convert this job lead to an application?'
            )}
          </p>
          <div className="bg-bg2 mt-4 rounded-lg p-4">
            <p className="text-primary font-medium">{jobTitle}</p>
            <p className="text-fg1 text-sm">{company}</p>
          </div>
        </div>

        <div className="border-tertiary flex justify-end gap-3 border-t p-4">
          <Button onClick={onClose} disabled={isConverting}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleConvert}
            disabled={
              isConverting ||
              !!error ||
              (!lead.converted_to_application_id &&
                (!lead.company?.trim() || !lead.title?.trim()))
            }
            className="flex items-center gap-2"
          >
            {isConverting ? (
              <>
                <i className="bi bi-arrow-repeat icon-sm animate-spin" />
                {t('Converting...')}
              </>
            ) : (
              <>
                <i className="bi bi-arrow-repeat icon-sm" />
                {t('Convert to Application')}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
