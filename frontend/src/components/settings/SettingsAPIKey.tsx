import { useState, useEffect } from 'react';
import { getAPIKey, regenerateAPIKey } from '../../lib/settings';
import type { APIKeyResponse } from '../../lib/types';
import { useToast } from '@/hooks/useToast';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsAPIKey() {
  const toast = useToast();
  const [apiKeyData, setApiKeyData] = useState<APIKeyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFullKey, setShowFullKey] = useState(false);

  useEffect(() => {
    loadAPIKey();
  }, []);

  async function loadAPIKey() {
    try {
      const data = await getAPIKey();
      setApiKeyData(data);
    } catch {
      toast.error('Failed to load API key');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyKey() {
    // Copy full key if available, otherwise copy masked
    const keyToCopy = apiKeyData?.api_key_full || apiKeyData?.api_key_masked;
    if (!keyToCopy) return;

    try {
      await navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      toast.success('API key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  async function handleRegenerateKey() {
    if (!confirm('Are you sure you want to regenerate your API key? Your current key will stop working immediately.')) {
      return;
    }

    setRegenerating(true);
    try {
      const data = await regenerateAPIKey();
      setApiKeyData(data);
      setShowFullKey(true); // Show the full key after regeneration
      toast.success('API key regenerated - copy it now! It won\'t be shown again.');
    } catch {
      toast.error('Failed to regenerate API key');
    } finally {
      setRegenerating(false);
    }
  }

  // Determine what to display
  const displayKey = (showFullKey && apiKeyData?.api_key_full)
    ? apiKeyData.api_key_full
    : apiKeyData?.api_key_masked;

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-xl font-bold text-fg1 mb-4">API Key</h2>
        <p className="text-sm text-muted mb-6">
          Use your API key to authenticate requests to the Tarnished API. Keep this key secure.
        </p>

        {loading ? (
          <Loading message="Loading API key..." />
        ) : apiKeyData?.has_api_key && apiKeyData.api_key_masked ? (
          <div className="space-y-4">
            {/* API Key Display */}
            <div className="bg-tertiary rounded-lg p-4">
              <label className="text-sm text-muted block mb-2">
                {showFullKey && apiKeyData?.api_key_full ? (
                  <span className="text-yellow">⚠️ Copy this key now - it won't be shown again!</span>
                ) : (
                  'Your API Key'
                )}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-sm text-fg1 bg-bg2 px-3 py-2 rounded overflow-x-auto break-all">
                  {displayKey}
                </div>
                <button
                  onClick={handleCopyKey}
                  className="px-3 py-2 bg-bg3 hover:bg-bg4 text-fg1 rounded transition-all duration-200 ease-in-out flex items-center gap-2 cursor-pointer flex-shrink-0"
                  title="Copy to clipboard"
                >
                  <i className={`bi-${copied ? 'check' : 'clipboard'} icon-sm`} />
                  <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Regenerate Section */}
            <div className="border-t border-tertiary pt-4 mt-4">
              <h3 className="text-sm font-medium text-fg1 mb-2">Regenerate Key</h3>
              <p className="text-xs text-muted mb-3">
                    This will invalidate your current API key. Any applications using it will need to be updated.
              </p>
              <button
                onClick={handleRegenerateKey}
                disabled={regenerating}
                className="px-4 py-2 bg-transparent text-red hover:bg-bg3 hover:text-red-bright rounded transition-all duration-200 ease-in-out flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className={`bi-arrow-repeat icon-sm${regenerating ? ' animate-spin' : ''}`} />
                {regenerating ? 'Regenerating...' : 'Regenerate API Key'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-tertiary rounded-lg p-4">
            <p className="text-muted text-sm mb-4">
              You don't have an API key yet. Generate one to access the Tarnished API.
            </p>
            <button
              onClick={handleRegenerateKey}
              disabled={regenerating}
              className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <i className={`bi-${regenerating ? 'arrow-repeat animate-spin' : 'key'} icon-sm`} />
              {regenerating ? 'Generating...' : 'Generate API Key'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
