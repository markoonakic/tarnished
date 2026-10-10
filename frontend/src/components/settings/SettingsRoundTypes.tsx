import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { isAxiosError } from 'axios';
import { roundTypeLabel } from '@/lib/referenceLabels';
import { useTranslation } from 'react-i18next';
import { observeRead } from '@/lib/queryClient';
import { useState, useEffect, useRef } from 'react';
import {
  listRoundTypes,
  createRoundType,
  updateRoundType,
  deleteRoundType,
} from '../../lib/settings';
import type { RoundType } from '../../lib/types';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsRoundTypes() {
  useTranslation();
  const [roundTypes, setRoundTypes] = useState<RoundType[]>([]);
  const [newRoundTypeName, setNewRoundTypeName] = useState('');
  const [editingRoundType, setEditingRoundType] = useState<RoundType | null>(
    null
  );
  const [editRoundTypeName, setEditRoundTypeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => observeRead(loadData), []);

  async function loadData() {
    try {
      const roundTypeData = await listRoundTypes();
      setRoundTypes(roundTypeData);
      setError('');
    } catch (error) {
      setError(t('Failed to load settings'));
      return { error };
    } finally {
      setLoading(false);
    }
  }

  function startEditRoundType(roundType: RoundType) {
    setEditingRoundType(roundType);
    setEditRoundTypeName(roundType.name);
  }

  async function handleUpdateRoundType(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRoundType || !editRoundTypeName.trim() || submitting.current)
      return;
    submitting.current = true;
    setBusy(true);
    try {
      await updateRoundType(editingRoundType.id, {
        expected_name: editingRoundType.name,
        name: editRoundTypeName.trim(),
      });
      setEditingRoundType(null);
      loadData();
    } catch (error) {
      setError(
        t(
          isAxiosError(error) && error.response?.status === 409
            ? 'Settings changed. Reload and review before retrying.'
            : 'Failed to update round type'
        )
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function handleDeleteRoundType(roundType: RoundType) {
    if (
      !confirm(t('Delete round type "{{name}}"?', { name: roundType.name }))
    ) {
      return;
    }

    try {
      await deleteRoundType(roundType.id);
      loadData();
    } catch {
      setError(t('Failed to delete round type'));
    }
  }

  async function handleAddRoundType(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoundTypeName.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await createRoundType({ name: newRoundTypeName.trim() });
      setNewRoundTypeName('');
      loadData();
    } catch {
      setError(t('Failed to create round type'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">
          {t('Interview Round Types')}
        </h2>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <Loading message={t('Loading settings...')} />
        ) : (
          <>
            {roundTypes.filter((t) => !t.is_default).length === 0 && (
              <p className="text-muted bg-tertiary mb-4 rounded p-3 text-sm">
                {t(
                  'Using default round types. Add custom round types to override.'
                )}
              </p>
            )}
            <div className="mb-4 space-y-2">
              {roundTypes.map((type) => (
                <div
                  key={type.id}
                  className="bg-tertiary flex min-w-0 items-center justify-between gap-3 rounded px-3 py-2"
                >
                  <span className="text-fg1 min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {roundTypeLabel(type)}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {type.is_default && (
                      <span className="text-muted text-xs">{t('Default')}</span>
                    )}
                    {!type.is_default && (
                      <>
                        <Button
                          onClick={() => startEditRoundType(type)}
                          className="flex items-center gap-1.5"
                        >
                          <i className="bi-pencil icon-xs"></i>
                          {t('Edit')}
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => handleDeleteRoundType(type)}
                          className="flex items-center gap-1.5"
                        >
                          <i className="bi-trash icon-xs"></i>
                          {t('Delete')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {editingRoundType ? (
              <form
                onSubmit={handleUpdateRoundType}
                className="bg-secondary mb-4 rounded p-3"
              >
                <div className="text-muted mb-2 text-sm">
                  {t('Edit Round Type')}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editRoundTypeName}
                    onChange={(e) => setEditRoundTypeName(e.target.value)}
                    placeholder={t('Round type name')}
                    aria-label={t('Round type name')}
                    className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright min-w-0 flex-1 rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  />
                  <Button variant="primary" type="submit" disabled={busy}>
                    {t('Save')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setEditingRoundType(null)}
                  >
                    {t('Cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddRoundType} className="flex gap-2">
                <input
                  type="text"
                  value={newRoundTypeName}
                  onChange={(e) => setNewRoundTypeName(e.target.value)}
                  placeholder={t('New round type name')}
                  aria-label={t('New round type name')}
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright min-w-0 flex-1 rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
                <Button variant="primary" type="submit" disabled={busy}>
                  {t('Add')}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </>
  );
}
