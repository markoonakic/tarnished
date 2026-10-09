import HelpTip from '../HelpTip';
import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import ImportModal from '../ImportModal';
import { SettingsBackLink } from './SettingsLayout';

interface SettingsImportProps {
  onImportSuccess?: () => void;
}

export default function SettingsImport({
  onImportSuccess,
}: SettingsImportProps) {
  useTranslation();
  const [showImportModal, setShowImportModal] = useState(false);

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 flex items-center gap-2 text-xl font-bold">
          {t('Data Import')}{' '}
          <HelpTip label={t('Data Import')}>
            {t(
              'Import job application data from a previously exported ZIP file.'
            )}
          </HelpTip>
        </h2>

        <Button variant="primary" onClick={() => setShowImportModal(true)}>
          {t('Import Data')}
        </Button>
      </div>

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          setShowImportModal(false);
          onImportSuccess?.();
        }}
      />
    </>
  );
}
