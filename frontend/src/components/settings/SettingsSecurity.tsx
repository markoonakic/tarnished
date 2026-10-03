import { useState } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import PasswordInput from '../PasswordInput';
import { newPasswordError } from '../../lib/password';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsSecurity() {
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
      setError(passwordError || 'Passwords do not match');
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
          ? 'Could not change password. Check your current password or sign in again.'
          : 'Could not sign out sessions. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="md:hidden">
        <SettingsBackLink />
      </div>
      <div className="bg-secondary space-y-4 rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 text-xl font-bold">Security</h2>
        <p className="text-muted">
          Changing your password signs out all browser sessions. API keys stay
          active; you can revoke them in API Keys.
        </p>
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
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
            autoComplete="current-password"
          />
          <PasswordInput
            label="New password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirm new password"
            value={confirmation}
            onChange={setConfirmation}
            required
            autoComplete="new-password"
          />
          <button
            className="touch-target bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
            disabled={busy}
          >
            Change password and sign out
          </button>
        </form>
        <button
          className="touch-target text-fg1 hover:bg-bg2 cursor-pointer rounded-md px-4 py-2 transition-all duration-200 ease-in-out disabled:opacity-50"
          disabled={busy}
          onClick={() => void invalidate(false)}
        >
          Sign out all sessions
        </button>
      </div>
    </section>
  );
}
