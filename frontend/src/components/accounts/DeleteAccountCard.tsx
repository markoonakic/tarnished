import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { t } from '@/lib/i18n';
import { apiV030 } from '@/lib/apiV030';
import { observeRead } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import Modal from '@/components/Modal';
import PasswordInput from '@/components/PasswordInput';

export default function DeleteAccountCard() {
  useTranslation();
  const { signOut } = useAuth();
  const [canDelete, setCanDelete] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(
    () =>
      observeRead(async () => {
        try {
          setCanDelete((await apiV030.account()).can_delete_account);
          setError('');
        } catch (cause) {
          setError(t('accounts.accountLoadError'));
          return { error: cause };
        }
      }),
    []
  );
  async function remove() {
    if (!password || !confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiV030.deleteAccount(password, confirm);
      signOut();
    } catch (cause) {
      if (axios.isAxiosError(cause) && cause.response?.status === 409) {
        setCanDelete(false);
        setError(t('accounts.onlyAdmin'));
      } else setError(t('accounts.deleteError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="bg-secondary border-red space-y-4 rounded-lg border p-4 md:p-6">
        <h2 className="text-red text-xl font-bold">
          {t('accounts.deleteAccount')}
        </h2>
        <p className="text-muted">{t('accounts.deleteAccountBody')}</p>
        {canDelete === false && (
          <p className="text-muted text-sm">{t('accounts.onlyAdmin')}</p>
        )}
        {error && !open && (
          <p className="text-red" role="alert">
            {error}
          </p>
        )}
        <button
          disabled={canDelete !== true}
          onClick={() => {
            setOpen(true);
            setError('');
          }}
          className="touch-target bg-red text-bg0 hover:bg-red-bright focus:ring-red cursor-pointer rounded px-4 py-2 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('accounts.deleteAccount')}
        </button>
      </div>
      {open && (
        <Modal
          label={t('accounts.deleteAccount')}
          busy={busy}
          onClose={() => {
            setOpen(false);
            setPassword('');
            setConfirm(false);
          }}
        >
          <form
            className="bg-secondary mx-4 w-full max-w-lg space-y-4 rounded-lg p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void remove();
            }}
          >
            <h2 className="text-red text-xl font-bold">
              {t('accounts.deleteAccount')}
            </h2>
            <p className="text-muted text-sm">
              {t('accounts.deleteAccountBody')}
            </p>
            {error && (
              <p className="text-red" role="alert">
                {error}
              </p>
            )}
            <fieldset disabled={busy} className="space-y-4">
              <PasswordInput
                label={t('Current password')}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                required
              />
              <label className="text-muted flex items-start gap-3 text-sm">
                <input
                  className="mt-1 shrink-0"
                  type="checkbox"
                  required
                  checked={confirm}
                  onChange={(event) => setConfirm(event.target.checked)}
                />
                {t('accounts.deleteConfirmation')}
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="text-fg1 focus:ring-accent cursor-pointer rounded px-4 py-2 focus:ring-2"
                  onClick={() => {
                    setOpen(false);
                    setPassword('');
                    setConfirm(false);
                  }}
                >
                  {t('accounts.cancel')}
                </button>
                <button
                  disabled={!confirm || !password || canDelete === false}
                  className="bg-red text-bg0 hover:bg-red-bright focus:ring-red cursor-pointer rounded px-4 py-2 focus:ring-2 disabled:opacity-40"
                >
                  {t('accounts.deletePermanently')}
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </>
  );
}
