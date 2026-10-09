import Button from '@/components/ui/Button';
import TextLink from '@/components/ui/TextLink';
import { t } from '@/lib/i18n';
import LanguageSwitch from '@/components/LanguageSwitch';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api, { safeErrorMessage } from '../lib/api';
import { observeRead } from '../lib/queryClient';
import { login } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function Login() {
  useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  useEffect(() => {
    return observeRead(() =>
      api.get('/api/auth/setup-status').then(
        (response) => setNeedsSetup(response.data.needs_setup),
        (error: unknown) => ({ error }) // Sign-in stays available during recovery.
      )
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPending(false);
    setLoading(true);

    try {
      await login({ email, password });
      await refreshUser();
      navigate('/');
    } catch (err: unknown) {
      const code = axios.isAxiosError(err)
        ? (err.response?.data?.code ?? err.response?.data?.detail?.code)
        : undefined;
      setPending(code === 'account_pending');
      setError(
        code === 'account_pending'
          ? t('accounts.pendingMessage')
          : code === 'account_deactivated'
            ? t('accounts.deactivatedMessage')
            : axios.isAxiosError(err)
              ? safeErrorMessage(
                  err.response?.data?.detail,
                  t(
                    'Login failed. Check your email and password and try again.'
                  )
                )
              : t('Login failed')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-secondary rounded-lg p-8">
          <div className="text-fg1 mx-auto mb-4 h-12 w-12 bg-current [mask-image:url('/tree.svg')] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]" />
          <h1 className="text-fg1 mb-6 text-center text-2xl font-bold">
            {t('Sign In')}
          </h1>

          {error && (
            <div
              role="alert"
              className={`mb-4 rounded border p-3 ${pending ? 'bg-yellow/10 border-yellow text-yellow' : 'bg-red-bright/20 border-red-bright text-red-bright'}`}
            >
              {error}
            </div>
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
              autoComplete="current-password"
            />

            <Button
              variant="primary"
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? t('Signing in...') : t('Sign In')}
            </Button>
          </form>

          <p className="text-muted mt-4 text-center">
            {!needsSetup && t('accounts.noAccount')}{' '}
            <TextLink to="/register">
              {needsSetup
                ? t('Create the first admin account')
                : t('accounts.createOne')}
            </TextLink>
          </p>
        </div>
        <LanguageSwitch />
      </div>
    </div>
  );
}
