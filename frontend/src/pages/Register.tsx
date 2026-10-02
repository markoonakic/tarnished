import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

export default function Register() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function refreshStatus() {
    setLoading(true);
    try {
      const response = await api.get('/api/auth/setup-status');
      setMessage(
        response.data.needs_setup
          ? 'Owner setup is still required.'
          : 'Setup is complete. You can sign in.'
      );
    } catch {
      setMessage('Cannot check setup status. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-secondary w-full max-w-md space-y-4 rounded-lg p-8">
        <h1 className="text-accent-bright text-2xl font-bold">Account setup</h1>
        <p>
          Accounts are managed by your administrator. There is no public
          registration.
        </p>
        <p>
          For a new installation, the host operator runs this command in the
          configured backend environment after migrations:
        </p>
        <code className="bg-bg2 block overflow-x-auto rounded p-3">
          python -m app.manage bootstrap-owner --email owner@example.com
        </code>
        <p className="text-muted">
          The command prompts privately for a password. It works only once. See
          the account recovery guide for container commands. Never paste
          passwords or server secrets here.
        </p>
        <button
          className="touch-target bg-accent text-bg0 rounded px-4 py-2 disabled:opacity-50"
          disabled={loading}
          onClick={refreshStatus}
        >
          Refresh setup status
        </button>
        <p role="status">{message}</p>
        <Link className="text-accent block" to="/login">
          Sign in
        </Link>
      </div>
    </div>
  );
}
