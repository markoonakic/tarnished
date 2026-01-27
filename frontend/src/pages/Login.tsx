import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-lg bg-secondary">
        <h1 className="text-2xl font-bold mb-6 text-accent-aqua">
          Sign In
        </h1>

        {error && (
          <div className="mb-4 p-3 rounded border border-accent-red text-accent-red" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}>
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
              className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua transition-colors duration-200"
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
            className="w-full px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright disabled:opacity-50 transition-all duration-200 cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

          <p className="mt-4 text-center text-muted">
            Don't have an account?{' '}
            <Link to="/register" className="text-aqua hover:text-aqua-bright transition-colors duration-200 cursor-pointer">Register</Link>
          </p>
      </div>
    </div>
  );
}
