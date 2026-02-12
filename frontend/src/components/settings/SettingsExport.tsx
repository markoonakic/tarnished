import { useState } from 'react';
import { exportJSON, exportCSV, exportZIP } from '../../lib/export';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  async function handleExportJSON() {
    setExporting(true);
    try {
      await exportJSON();
    } catch {
      setError('Failed to export data');
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCSV() {
    setExporting(true);
    try {
      await exportCSV();
    } catch {
      setError('Failed to export data');
    } finally {
      setExporting(false);
    }
  }

  async function handleExportZIP() {
    setExporting(true);
    try {
      await exportZIP();
    } catch {
      setError('Failed to export data');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-xl font-bold text-fg1 mb-4">Data Export</h2>

        {error && (
          <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <p className="text-sm text-muted mb-4">
          Download all your application data for backup or analysis.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportJSON}
            disabled={exporting}
            className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 cursor-pointer"
          >
            {exporting ? 'Exporting...' : 'Export JSON'}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 cursor-pointer"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={handleExportZIP}
            disabled={exporting}
            className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 cursor-pointer"
          >
            {exporting ? 'Exporting...' : 'Export ZIP (with files)'}
          </button>
        </div>
      </div>
    </>
  );
}
