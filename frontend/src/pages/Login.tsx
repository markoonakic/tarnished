import { t } from '@/lib/i18n';
import LanguageSwitch from '@/components/LanguageSwitch';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
    setLoading(true);

    try {
      await login({ email, password });
      await refreshUser();
      navigate('/');
    } catch (err: unknown) {
      setError(
        axios.isAxiosError(err)
          ? safeErrorMessage(
              err.response?.data?.detail,
              t('Login failed. Check your email and password and try again.')
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
          <h1 className="text-accent-bright mb-6 text-2xl font-bold">
            {t('Sign In')}
          </h1>

          {error && (
            <div
              role="alert"
              className="bg-red-bright/20 border-red-bright text-red-bright mb-4 rounded border p-3"
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

            <button
              type="submit"
              disabled={loading}
              className="bg-accent text-bg0 hover:bg-accent-bright w-full cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
            >
              {loading ? t('Signing in...') : t('Sign In')}
            </button>
          </form>

          <p className="text-muted mt-4 text-center">
            {!needsSetup && t('Contact your administrator for an account.')}{' '}
            <Link
              to="/register"
              className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out"
            >
              {needsSetup
                ? t('Create the first admin account')
                : t('Account setup')}
            </Link>
          </p>
        </div>
        <LanguageSwitch />
      </div>
    </div>
  );
}
