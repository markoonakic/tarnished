import { useState, useEffect } from 'react';
import { updateUser, deleteUser } from '../lib/admin';
import type { User } from '../lib/admin';

interface Props {
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
  currentUserId: string | undefined;
}

export default function EditUserModal({ user, onClose, onSuccess, currentUserId }: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isCurrentUser = user?.id === currentUserId;

  // Sync state with user prop
  useEffect(() => {
    if (user) {
      setIsAdmin(user.is_admin);
      setIsActive(user.is_active);
      setPassword('');
      setError('');
    }
  }, [user]);

  // Focus and escape handling
  useEffect(() => {
    if (user) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [user, onClose]);

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await updateUser(user.id, {
        is_admin: isAdmin,
        is_active: isActive,
        ...(password ? { password } : {}),
      });
      onSuccess();
      onClose();
    } catch {
      setError('Failed to update user');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete user "${user.email}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await deleteUser(user.id);
      onSuccess();
      onClose();
    } catch {
      setError('Failed to delete user');
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
      aria-labelledby="edit-modal-title"
    >
      <div className="bg-secondary rounded-lg max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-tertiary">
          <h3 id="edit-modal-title" className="text-primary font-medium">Edit User</h3>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg1 hover:text-fg0 p-1 rounded transition-all duration-200 cursor-pointer"
          >
            <i className="bi bi-x-lg text-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="pb-4 border-b border-tertiary">
            <p className="text-sm text-muted">Email</p>
            <p className="text-primary font-medium">{user.email}</p>
          </div>

          {error && (
            <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                disabled={isCurrentUser}
                autoFocus
                className="w-4 h-4 rounded border-tertiary"
              />
              <span className="text-sm text-primary">Admin</span>
            </label>
            {isCurrentUser && (
              <p className="text-xs text-muted mt-1 ml-7">You cannot change your own admin status</p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isCurrentUser}
                className="w-4 h-4 rounded border-tertiary"
              />
              <span className="text-sm text-primary">Active</span>
            </label>
            {isCurrentUser && (
              <p className="text-xs text-muted mt-1 ml-7">You cannot change your own active status</p>
            )}
          </div>

          <div>
            <label className="block mb-1 text-sm font-semibold text-muted">
              New Password (optional)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-fg1 placeholder-muted focus:outline-none focus:border-accent-aqua transition-colors duration-200"
              placeholder="Leave blank to keep current password"
              minLength={8}
            />
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-tertiary">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isCurrentUser || loading}
              className="px-4 py-2 bg-accent-red/20 text-accent-red rounded font-medium hover:bg-accent-red/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
            >
              Delete
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50 transition-all duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright disabled:opacity-50 transition-all duration-200 cursor-pointer"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
