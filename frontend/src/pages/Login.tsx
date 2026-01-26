import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';

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
          <div className="mb-4 p-3 rounded bg-accent-red text-primary">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 text-muted">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 rounded bg-tertiary text-primary"
              required
            />
          </div>

          <div>
            <label className="block mb-1 text-muted">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 rounded bg-tertiary text-primary"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-accent-aqua text-bg-primary rounded font-medium hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-muted">
          Don't have an account?{' '}
          <Link to="/register" className="text-accent-blue hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
