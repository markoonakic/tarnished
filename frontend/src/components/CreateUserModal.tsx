import { useState, useEffect } from 'react';
import { createUser } from '../lib/admin';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateUserModal({ isOpen, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setError('');
    }
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await createUser({ email, password });
      onSuccess();
      onClose();
    } catch {
      setError('Failed to create user. Email may already be in use.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-secondary rounded-lg max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-tertiary">
          <h3 id="modal-title" className="text-primary font-medium">Create User</h3>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg1 hover:text-fg0 p-1 rounded transition-all duration-200 cursor-pointer"
          >
            <i className="bi bi-x-lg text-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block mb-1 text-sm font-semibold text-muted">
              Email <span className="text-accent-red">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-tertiary rounded text-fg1 placeholder-muted focus:outline-none focus:border-aqua-bright transition-colors duration-200 ease-out"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-semibold text-muted">
              Password <span className="text-accent-red">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-tertiary rounded text-fg1 placeholder-muted focus:outline-none focus:border-aqua-bright transition-colors duration-200 ease-out"
              required
              minLength={8}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-tertiary">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-bg1 text-fg1 rounded hover:bg-bg2 hover:text-fg0 disabled:opacity-50 transition-all duration-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright disabled:opacity-50 transition-all duration-200 cursor-pointer"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
