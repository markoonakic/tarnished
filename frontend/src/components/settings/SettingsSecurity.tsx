import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import PasswordInput from '../PasswordInput';
import HelpTip from '../HelpTip';
import { newPasswordError } from '../../lib/password';
import { SettingsBackLink } from './SettingsLayout';
import DeleteAccountCard from '../accounts/DeleteAccountCard';

export default function SettingsSecurity() {
  useTranslation();
  const { signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function invalidate(changePassword: boolean) {
    setError('');
    const passwordError = newPasswordError(password);
    if (changePassword && (passwordError || password !== confirmation)) {
      setError(passwordError || t('Passwords do not match'));
      return;
    }
    setBusy(true);
    try {
      await api.post(
        changePassword ? '/api/auth/change-password' : '/api/auth/signout-all',
        changePassword
          ? { current_password: currentPassword, new_password: password }
          : undefined
      );
      signOut();
    } catch {
      setError(
        changePassword
          ? t(
              'Could not change password. Check your current password or sign in again.'
            )
          : t('Could not sign out sessions. Try again.')
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="md:hidden">
        <SettingsBackLink />
      </div>
      <div className="bg-secondary space-y-4 rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 flex items-center gap-2 text-lg font-semibold">
          {t('Security')}{' '}
          <HelpTip label={t('Security')}>
            {t(
              'Changing your password signs out all browser sessions. API keys stay active; you can revoke them in API Keys.'
            )}
          </HelpTip>
        </h2>
        {error && (
          <p role="alert" className="text-red-bright">
            {error}
          </p>
        )}
        <form
          className="max-w-md space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void invalidate(true);
          }}
        >
          <PasswordInput
            label={t('Current password')}
            value={currentPassword}
            onChange={setCurrentPassword}
            required
            autoComplete="current-password"
          />
          <PasswordInput
            label={t('New password')}
            value={password}
            onChange={setPassword}
            required
            autoComplete="new-password"
          />
          <PasswordInput
            label={t('Confirm new password')}
            value={confirmation}
            onChange={setConfirmation}
            required
            autoComplete="new-password"
          />
          <Button variant="primary" className="touch-target" disabled={busy}>
            {t('Change password and sign out')}
          </Button>
        </form>
        <Button
          className="touch-target"
          disabled={busy}
          onClick={() => void invalidate(false)}
        >
          {t('Sign out all sessions')}
        </Button>
      </div>
      <DeleteAccountCard />
    </section>
  );
}
