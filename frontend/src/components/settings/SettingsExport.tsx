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
        <h2 className="text-fg1 mb-4 text-xl font-bold">Data Export</h2>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
            {error}
          </div>
        )}

        <p className="text-muted mb-4 text-sm">
          Download all your application data for backup or analysis.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportJSON}
            disabled={exporting}
            className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export JSON'}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={handleExportZIP}
            disabled={exporting}
            className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export ZIP (with files)'}
          </button>
        </div>
      </div>
    </>
  );
}
