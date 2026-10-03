import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import api, { safeErrorMessage } from '../lib/api';
import { observeRead } from '../lib/queryClient';
import { login } from '../lib/auth';
import { newPasswordError } from '../lib/password';
import { useAuth } from '../contexts/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function Register() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
      setError('Cannot check setup status. Try again.');
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
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    let created = false;
    try {
      await api.post('/api/auth/setup', { email, password });
      created = true;
      await login({ email, password });
      await refreshUser();
      navigate('/');
    } catch (err: unknown) {
      if (created) {
        setNeedsSetup(false);
        setError('Your account was created. Sign in to continue.');
      } else {
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          setNeedsSetup(false);
        }
        setError(
          axios.isAxiosError(err)
            ? safeErrorMessage(
                err.response?.data?.detail,
                'Setup failed. Try again.'
              )
            : 'Setup failed. Try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-secondary w-full max-w-md space-y-4 rounded-lg p-8">
        <h1 className="text-accent-bright text-2xl font-bold">
          {needsSetup ? 'Create the first admin account' : 'Account setup'}
        </h1>
        {checking && <p role="status">Checking setup status...</p>}
        {error && (
          <div
            role="alert"
            className="bg-red-bright/20 border-red-bright text-red-bright rounded border p-3"
          >
            {error}
          </div>
        )}
        {!checking && needsSetup === true && (
          <>
            <p>Create an administrator account to start using Tarnished.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  Email
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
                label="Password"
                required
                autoComplete="new-password"
              />
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                label="Confirm password"
                required
                autoComplete="new-password"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-accent text-bg0 hover:bg-accent-bright w-full cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Create admin account'}
              </button>
            </form>
          </>
        )}
        {!checking && needsSetup === false && (
          <p>
            Accounts are managed by your administrator. There is no public
            registration.
          </p>
        )}
        {!checking && needsSetup === null && (
          <button
            className="touch-target bg-accent text-bg0 rounded px-4 py-2"
            onClick={refreshStatus}
          >
            Retry setup check
          </button>
        )}
        <Link className="text-accent block" to="/login">
          Sign in
        </Link>
      </div>
    </div>
  );
}
