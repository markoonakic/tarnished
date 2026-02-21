import { useState } from 'react';
import ImportModal from '../ImportModal';
import { SettingsBackLink } from './SettingsLayout';

interface SettingsImportProps {
  onImportSuccess?: () => void;
}

export default function SettingsImport({
  onImportSuccess,
}: SettingsImportProps) {
  const [showImportModal, setShowImportModal] = useState(false);

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">Data Import</h2>

        <p className="text-muted mb-4 text-sm">
          Import job application data from a previously exported ZIP file.
        </p>
        <button
          onClick={() => setShowImportModal(true)}
          className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
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
