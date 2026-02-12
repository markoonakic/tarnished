import { useState } from 'react';
import ImportModal from '../ImportModal';
import { SettingsBackLink } from './SettingsLayout';

interface SettingsImportProps {
  onImportSuccess?: () => void;
}

export default function SettingsImport({ onImportSuccess }: SettingsImportProps) {
  const [showImportModal, setShowImportModal] = useState(false);

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-xl font-bold text-fg1 mb-4">Data Import</h2>

        <p className="text-sm text-muted mb-4">
          Import job application data from a previously exported ZIP file.
        </p>
        <button
          onClick={() => setShowImportModal(true)}
          className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
        >
          Import Data
        </button>
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
