import Button from '@/components/ui/Button';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { t } from '@/lib/i18n';
import { apiV030 } from '@/lib/apiV030';
import { observeRead } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import Modal from '@/components/Modal';
import PasswordInput from '@/components/PasswordInput';
import HelpTip from '@/components/HelpTip';

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
        <h2 className="text-fg1 flex items-center gap-2 text-lg font-semibold">
          {t('accounts.deleteAccount')}
          <HelpTip label={t('accounts.deleteAccountBody')}>
            {t('accounts.deleteAccountBody')}
            {canDelete === false && <span>{t('accounts.onlyAdmin')}</span>}
          </HelpTip>
        </h2>
        {error && !open && (
          <p className="text-red" role="alert">
            {error}
          </p>
        )}
        <Button
          variant="danger"
          disabled={canDelete !== true}
          title={canDelete === false ? t('accounts.onlyAdmin') : undefined}
          onClick={() => {
            setOpen(true);
            setError('');
          }}
          className="flex items-center gap-1.5"
        >
          <i className="bi-trash icon-sm" aria-hidden="true" />
          {t('accounts.deleteAccount')}
        </Button>
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
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-fg1 text-xl font-bold">
                {t('accounts.deleteAccount')}
              </h2>
              <Button
                variant="icon"
                type="button"
                disabled={busy}
                aria-label={t('accounts.close')}

                onClick={() => {
                  setOpen(false);
                  setPassword('');
                  setConfirm(false);
                }}
                title={t('accounts.close')}
              >
                <i className="bi-x-lg" aria-hidden="true" />
              </Button>
            </div>
            <p className="text-muted text-sm">
              {t('accounts.deleteModalBody')}
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
                <Button
                  type="button"
                  className="flex items-center gap-1.5"
                  onClick={() => {
                    setOpen(false);
                    setPassword('');
                    setConfirm(false);
                  }}
                >
                  <i className="bi-x-lg icon-sm" aria-hidden="true" />
                  {t('accounts.cancel')}
                </Button>
                <Button
                  variant="danger"
                  disabled={!confirm || !password || canDelete === false}
                  className="flex items-center gap-1.5"
                >
                  <i className="bi-trash icon-sm" aria-hidden="true" />
                  {t('accounts.deletePermanently')}
                </Button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </>
  );
}
