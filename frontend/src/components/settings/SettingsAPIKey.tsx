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
    // Always copy the full key
    const keyToCopy = apiKeyData?.api_key_full;
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
    if (
      !confirm(
        'Are you sure you want to regenerate your API key? Your current key will stop working immediately.'
      )
    ) {
      return;
    }

    setRegenerating(true);
    try {
      const data = await regenerateAPIKey();
      setApiKeyData(data);
      setShowFullKey(true); // Show the full key after regeneration
      toast.success('API key regenerated successfully');
    } catch {
      toast.error('Failed to regenerate API key');
    } finally {
      setRegenerating(false);
    }
  }

  // Determine what to display
  const displayKey =
    showFullKey && apiKeyData?.api_key_full
      ? apiKeyData.api_key_full
      : apiKeyData?.api_key_masked;

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">API Key</h2>
        <p className="text-muted mb-6 text-sm">
          Use your API key to authenticate requests to the Tarnished API. Keep
          this key secure.
        </p>

        {loading ? (
          <Loading message="Loading API key..." />
        ) : apiKeyData?.has_api_key && apiKeyData.api_key_masked ? (
          <div className="space-y-4">
            {/* API Key Display */}
            <div className="bg-tertiary rounded-lg p-4">
              <span className="text-muted mb-2 block text-sm">
                Your API Key
              </span>
              <div className="flex items-center gap-2">
                <div className="text-fg1 bg-bg2 flex-1 overflow-x-auto rounded px-3 py-2 font-mono text-sm break-all">
                  {displayKey}
                </div>
                <button
                  onClick={handleCopyKey}
                  className="bg-bg3 hover:bg-bg4 text-fg1 flex flex-shrink-0 cursor-pointer items-center gap-2 rounded px-3 py-2 transition-all duration-200 ease-in-out"
                  title="Copy to clipboard"
                >
                  <i
                    className={`bi-${copied ? 'check' : 'clipboard'} icon-sm`}
                  />
                  <span className="hidden sm:inline">
                    {copied ? 'Copied' : 'Copy'}
                  </span>
                </button>
              </div>
            </div>

            {/* Regenerate Section */}
            <div className="border-tertiary mt-4 border-t pt-4">
              <h3 className="text-fg1 mb-2 text-sm font-medium">
                Regenerate Key
              </h3>
              <p className="text-muted mb-3 text-xs">
                This will invalidate your current API key. Any applications
                using it will need to be updated.
              </p>
              <button
                onClick={handleRegenerateKey}
                disabled={regenerating}
                className="text-red hover:bg-bg3 hover:text-red-bright flex cursor-pointer items-center gap-2 rounded bg-transparent px-4 py-2 transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i
                  className={`bi-arrow-repeat icon-sm${regenerating ? 'animate-spin' : ''}`}
                />
                {regenerating ? 'Regenerating...' : 'Regenerate API Key'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-tertiary rounded-lg p-4">
            <p className="text-muted mb-4 text-sm">
              You don't have an API key yet. Generate one to access the
              Tarnished API.
            </p>
            <button
              onClick={handleRegenerateKey}
              disabled={regenerating}
              className="bg-accent text-bg0 hover:bg-accent-bright flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i
                className={`bi-${regenerating ? 'arrow-repeat animate-spin' : 'key'} icon-sm`}
              />
              {regenerating ? 'Generating...' : 'Generate API Key'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
