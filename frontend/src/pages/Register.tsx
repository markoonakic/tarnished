import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register, login } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await register({ email, password });
      await login({ email, password });
      await refreshUser();
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-lg bg-secondary">
        <h1 className="text-2xl font-bold mb-6 text-accent-aqua">
          Create Account
        </h1>

        {error && (
          <div className="mb-4 p-3 rounded border border-accent-red text-accent-red bg-red/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-semibold text-muted">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:border-aqua-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
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
            label="Confirm Password"
            required
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-aqua text-bg0 hover:bg-aqua-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 w-full"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

          <p className="mt-4 text-center text-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-aqua hover:text-aqua-bright transition-all duration-200 ease-in-out">Sign in</Link>
          </p>
      </div>
    </div>
  );
}
