import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import HelpTip from '../HelpTip';
import { isAxiosError } from 'axios';
import { statusLabel } from '@/lib/referenceLabels';
import { historyStageLabels } from '@/lib/history';
import { useTranslation } from 'react-i18next';
import { observeRead } from '@/lib/queryClient';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listStatuses,
  createStatus,
  updateStatus,
  deleteStatus,
} from '../../lib/settings';
import {
  statusMeanings,
  type Status,
  type StatusMeaning,
} from '../../lib/types';
import { getDefaultNewStatusColor } from '../../lib/statusColors';
import { useThemeColors } from '../../hooks/useThemeColors';
import Loading from '../Loading';
import Dropdown from '../Dropdown';
import { SettingsBackLink } from './SettingsLayout';

const stageLabel = (meaning: StatusMeaning) =>
  meaning === 'unknown' ? t('Unclassified') : historyStageLabels[meaning];

export default function SettingsStatuses() {
  useTranslation();
  const stageOptions = statusMeanings.map((meaning) => ({
    value: meaning,
    label: stageLabel(meaning),
  }));
  const colors = useThemeColors();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [newStatusName, setNewStatusName] = useState('');
  const [newMeaning, setNewMeaning] = useState<StatusMeaning>('unknown');
  const [editMeaning, setEditMeaning] = useState<StatusMeaning>('unknown');
  const [newStatusColor, setNewStatusColor] = useState(() =>
    getDefaultNewStatusColor(colors)
  );
  const [editingStatus, setEditingStatus] = useState<Status | null>(null);
  const [editStatusName, setEditStatusName] = useState('');
  const [editStatusColor, setEditStatusColor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const statusData = await listStatuses();
      setStatuses(statusData);
      setError('');
    } catch (error) {
      setError(t('Failed to load settings'));
      return { error };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => observeRead(loadData), [loadData]);

  // Use the new theme color until the user starts a draft.
  useEffect(() => {
    if (!newStatusName) {
      setNewStatusColor(getDefaultNewStatusColor(colors));
    }
  }, [colors, newStatusName]);

  async function handleAddStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatusName.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await createStatus({
        name: newStatusName.trim(),
        color: newStatusColor,
        meaning: newMeaning,
      });
      setNewStatusName('');
      loadData();
    } catch {
      setError(t('Failed to create status'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function startEditStatus(status: Status) {
    setEditingStatus(status);
    setEditStatusName(status.name);
    setEditStatusColor(status.color);
    setEditMeaning(status.meaning);
  }

  async function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStatus || !editStatusName.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await updateStatus(editingStatus.id, {
        expected_name: editingStatus.name,
        expected_color: editingStatus.color,
        expected_meaning: editingStatus.meaning,
        name: editStatusName.trim(),
        color: editStatusColor,
        meaning: editMeaning,
      });
      setEditingStatus(null);
      loadData();
    } catch (error) {
      setError(
        t(
          isAxiosError(error) && error.response?.status === 409
            ? 'Settings changed. Reload and review before retrying.'
            : 'Failed to update status'
        )
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function handleDeleteStatus(status: Status) {
    if (
      !confirm(
        t(
          'Delete status "{{value0}}"? Applications using this status will need to be updated.',
          { value0: statusLabel(status) }
        )
      )
    ) {
      return;
    }

    try {
      await deleteStatus(status.id, status);
      loadData();
    } catch (error) {
      setError(
        isAxiosError(error) &&
          error.response?.data?.detail?.code === 'settings_changed'
          ? t('Settings changed. Reload and review before retrying.')
          : t('Failed to delete status')
      );
    }
  }

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">
          {t('Application Statuses')}
          <HelpTip label={t('About application statuses')}>
            {t(
              'Choose the stage used in reports; the status name can be your own. Changes apply the next time a status is selected, not to existing history.'
            )}
          </HelpTip>
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
            {statuses.filter((s) => !s.is_default).length === 0 && (
              <p className="text-muted bg-tertiary mb-4 rounded p-3 text-sm">
                {t('Using default statuses. Add custom statuses to override.')}
              </p>
            )}
            <div className="mb-4 space-y-2">
              {statuses.map((status) => (
                <div
                  key={status.id}
                  className="bg-tertiary flex items-center justify-between gap-3 rounded px-3 py-2"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className="h-4 w-4 shrink-0 rounded"
                      style={{ backgroundColor: status.color }}
                    />
                    <div className="min-w-0">
                      <span className="text-fg1 [overflow-wrap:anywhere]">
                        {statusLabel(status)}
                      </span>
                      {!status.is_default && (
                        <p className="text-muted text-xs">
                          {t('Stage:')} {stageLabel(status.meaning)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {status.is_default && (
                      <span className="text-muted text-xs">{t('Default')}</span>
                    )}
                    {!status.is_default && (
                      <Button
                        onClick={() => startEditStatus(status)}
                        className="flex items-center gap-1.5"
                      >
                        <i className="bi-pencil icon-xs"></i>
                        {t('Edit')}
                      </Button>
                    )}
                    {!status.is_default && (
                      <Button
                        variant="danger"
                        onClick={() => handleDeleteStatus(status)}
                        className="flex items-center gap-1.5"
                      >
                        <i className="bi-trash icon-xs"></i>
                        {t('Delete')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {editingStatus ? (
              <form
                onSubmit={handleUpdateStatus}
                className="bg-secondary mb-4 rounded p-3"
              >
                <div className="text-muted mb-2 text-sm">
                  {t('Edit Status')}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-full sm:w-44">
                    <label
                      htmlFor="edit-status-stage"
                      className="text-muted mb-1 block text-sm"
                    >
                      {t('Stage')}
                    </label>
                    <Dropdown
                      id="edit-status-stage"
                      options={stageOptions}
                      value={editMeaning}
                      onChange={(value) =>
                        setEditMeaning(value as StatusMeaning)
                      }
                      containerBackground="bg1"
                    />
                  </div>
                  <input
                    type="text"
                    value={editStatusName}
                    onChange={(e) => setEditStatusName(e.target.value)}
                    placeholder={t('Status name')}
                    aria-label={t('Status name')}
                    className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright h-10 min-w-0 flex-1 rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  />
                  <input
                    type="color"
                    aria-label={t('Status color')}
                    value={editStatusColor}
                    onChange={(e) => setEditStatusColor(e.target.value)}
                    className="bg-bg2 border-tertiary h-10 w-10 cursor-pointer rounded border"
                  />
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={busy}
                    className="h-10"
                  >
                    {t('Save')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setEditingStatus(null)}
                    className="h-10"
                  >
                    {t('Cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleAddStatus}
                className="flex flex-wrap items-end gap-2"
              >
                <div className="w-full sm:w-44">
                  <label
                    htmlFor="new-status-stage"
                    className="text-muted mb-1 block text-sm"
                  >
                    {t('Stage')}
                  </label>
                  <Dropdown
                    id="new-status-stage"
                    options={stageOptions}
                    value={newMeaning}
                    onChange={(value) => setNewMeaning(value as StatusMeaning)}
                    containerBackground="bg1"
                  />
                </div>
                <input
                  type="text"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder={t('New status name')}
                  aria-label={t('New status name')}
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright h-10 min-w-0 flex-1 rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
                <input
                  type="color"
                  aria-label={t('New status color')}
                  value={newStatusColor}
                  onChange={(e) => setNewStatusColor(e.target.value)}
                  className="bg-bg2 border-tertiary h-10 w-10 cursor-pointer rounded border"
                />
                <Button
                  variant="primary"
                  type="submit"
                  disabled={busy}
                  className="h-10"
                >
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
