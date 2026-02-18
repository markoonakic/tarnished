import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { login } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login({ email, password });
      await refreshUser();
      navigate('/');
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.detail || 'Login failed' : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-lg bg-secondary">
        <h1 className="text-2xl font-bold mb-6 text-accent-bright">
          Sign In
        </h1>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-bright/20 border border-red-bright text-red-bright">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block mb-1 text-sm font-semibold text-muted">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              required
            />
          </div>

          <PasswordInput
            value={password}
            onChange={setPassword}
            label="Password"
            required
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 w-full cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

          <p className="mt-4 text-center text-muted">
            Don't have an account?{' '}
            <Link to="/register" className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out">Register</Link>
          </p>
      </div>
    </div>
  );
}
