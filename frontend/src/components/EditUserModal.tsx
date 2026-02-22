import { useState, useEffect } from 'react';
import { updateUser, deleteUser } from '../lib/admin';
import type { AdminUser } from '../lib/admin';

interface Props {
  user: AdminUser | null;
  onClose: () => void;
  onSuccess: () => void;
  currentUserId: string | undefined;
}

export default function EditUserModal({
  user,
  onClose,
  onSuccess,
  currentUserId,
}: Props) {
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
      await updateUser(user!.id, {
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
    if (
      !confirm(`Delete user "${user!.email}"? This action cannot be undone.`)
    ) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await deleteUser(user!.id);
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
      className="bg-bg0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div
        className="bg-bg1 mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex flex-shrink-0 items-center justify-between border-b p-4">
          <h3 id="edit-modal-title" className="text-primary font-medium">
            Edit User
          </h3>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded p-2 transition-all duration-200 ease-in-out"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto p-6"
        >
          <div className="border-tertiary border-b pb-4">
            <p className="text-muted text-sm">Email</p>
            <p className="text-primary font-medium">{user.email}</p>
          </div>

          {error && (
            <div className="bg-red-bright/20 border-red-bright text-red-bright rounded border px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                disabled={isCurrentUser}
                autoFocus
                className="border-tertiary h-4 w-4 rounded"
              />
              <span className="text-primary text-sm">Admin</span>
            </label>
            {isCurrentUser && (
              <p className="text-muted mt-1 ml-7 text-xs">
                You cannot change your own admin status
              </p>
            )}
          </div>

          <div>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isCurrentUser}
                className="border-tertiary h-4 w-4 rounded"
              />
              <span className="text-primary text-sm">Active</span>
            </label>
            {isCurrentUser && (
              <p className="text-muted mt-1 ml-7 text-xs">
                You cannot change your own active status
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="text-muted mb-1 block text-sm font-semibold"
            >
              New Password (optional)
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              placeholder="Leave blank to keep current password"
              minLength={8}
            />
          </div>

          <div className="border-tertiary flex flex-col-reverse justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isCurrentUser || loading}
              className="text-red hover:bg-bg2 hover:text-red-bright flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-transparent px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="bi-trash icon-sm" />
              Delete
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="text-fg1 hover:bg-bg2 hover:text-fg0 flex-1 cursor-pointer rounded-md bg-transparent px-4 py-2 transition-all duration-200 ease-in-out disabled:opacity-50 sm:flex-initial"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-accent text-bg0 hover:bg-accent-bright flex-1 cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50 sm:flex-initial"
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
