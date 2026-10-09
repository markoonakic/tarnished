import Button from '@/components/ui/Button';
import TextLink from '@/components/ui/TextLink';
import { t } from '@/lib/i18n';
import LanguageSwitch from '@/components/LanguageSwitch';
import { useTranslation } from 'react-i18next';
import HelpTip from '@/components/HelpTip';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api, { safeErrorMessage } from '../lib/api';
import { observeRead } from '../lib/queryClient';
import { login } from '../lib/auth';
import { newPasswordError } from '../lib/password';
import { useAuth } from '../contexts/AuthContext';
import PasswordInput from '../components/PasswordInput';
import { apiV030 } from '@/lib/apiV030';

export default function Register() {
  useTranslation();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  async function refreshStatus() {
    setChecking(true);
    setError('');
    try {
      const response = await api.get('/api/auth/setup-status');
      setNeedsSetup(response.data.needs_setup);
    } catch (error) {
      setNeedsSetup(null);
      setError(t('Cannot check setup status. Try again.'));
      return { error };
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => observeRead(refreshStatus, { staleTime: Infinity }), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const passwordError = newPasswordError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError(t('Passwords do not match.'));
      return;
    }
    setLoading(true);
    let created = false;
    try {
      if (!needsSetup) {
        await apiV030.register(email, password);
        setSent(true);
        setPassword('');
        setConfirmPassword('');
        return;
      }
      await api.post('/api/auth/setup', { email, password });
      created = true;
      await login({ email, password });
      await refreshUser();
      navigate('/');
    } catch (err: unknown) {
      if (created) {
        setNeedsSetup(false);
        setSetupComplete(true);
        setError(t('Your account was created. Sign in to continue.'));
      } else {
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          setNeedsSetup(false);
          setSetupComplete(true);
        }
        setError(
          axios.isAxiosError(err)
            ? safeErrorMessage(
                err.response?.data?.detail,
                needsSetup
                  ? t('Setup failed. Try again.')
                  : t('accounts.registerError')
              )
            : needsSetup
              ? t('Setup failed. Try again.')
              : t('accounts.registerError')
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-secondary space-y-4 rounded-lg p-8">
          {sent ? (
            <i
              className="bi-hourglass text-yellow mx-auto block text-center text-4xl"
              aria-hidden="true"
            />
          ) : (
            !needsSetup && (
              <div className="text-fg1 mx-auto h-12 w-12 bg-current [mask-image:url('/tree.svg')] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]" />
            )
          )}
          <h1
            className={
              needsSetup
                ? 'text-accent-bright text-2xl font-bold'
                : 'text-fg1 text-center text-2xl font-bold'
            }
          >
            {sent
              ? t('accounts.requestSent')
              : needsSetup
                ? t('Create the first admin account')
                : t('accounts.createAccount')}
            {!sent && !needsSetup && (
              <span className="ml-2">
                <HelpTip label={t('accounts.approvalIntro')}>
                  {t('accounts.approvalIntro')}
                </HelpTip>
              </span>
            )}
          </h1>
          {checking && <p role="status">{t('Checking setup status...')}</p>}
          {error && (
            <div
              role="alert"
              className="bg-red-bright/20 border-red-bright text-red-bright rounded border p-3"
            >
              {error}
            </div>
          )}
          {!checking && needsSetup !== null && !sent && !setupComplete && (
            <>
              {needsSetup && (
                <p>
                  {t(
                    'Create an administrator account to start using Tarnished.'
                  )}
                </p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="text-muted mb-1 block text-sm font-semibold"
                  >
                    {t('Email')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                    required
                  />
                </div>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  label={t('Password')}
                  required
                  autoComplete="new-password"
                />
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  label={t('Confirm password')}
                  required
                  autoComplete="new-password"
                />
                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center gap-1.5"
                >
                  <i className="bi-plus-lg icon-sm" aria-hidden="true" />
                  {loading
                    ? t('Creating account...')
                    : needsSetup
                      ? t('Create admin account')
                      : t('accounts.requestAccount')}
                </Button>
              </form>
            </>
          )}
          {sent && (
            <p className="text-muted text-center">
              {t('accounts.requestSentBody')}
            </p>
          )}
          {!checking && needsSetup === null && (
            <Button
              variant="primary"
              className="flex items-center gap-1.5"
              onClick={refreshStatus}
            >
              <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
              {t('Retry setup check')}
            </Button>
          )}
          <p className="text-muted text-center">
            {!sent && !needsSetup && t('accounts.alreadyHaveAccount')}{' '}
            <TextLink to="/login">
              {sent ? t('accounts.backToSignIn') : t('Sign in')}
            </TextLink>
          </p>
        </div>
        <LanguageSwitch />
      </div>
    </div>
  );
}
