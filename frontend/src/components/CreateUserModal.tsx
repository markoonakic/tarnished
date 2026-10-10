import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import HelpTip from './HelpTip';
import { newPasswordError } from '../lib/password';
import { useState, useEffect } from 'react';
import { createUser } from '../lib/admin';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateUserModal({ isOpen, onClose, onSuccess }: Props) {
  useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Discard credentials when the dialog closes.
  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const passwordError = newPasswordError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setLoading(true);
    setError('');

    try {
      await createUser({ email, password });
      onSuccess();
      onClose();
    } catch {
      setError(t('Failed to create user. Email may already be in use.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="modal-title" busy={loading}>
      <div
        className="bg-bg1 mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex flex-shrink-0 items-center justify-between border-b p-4">
          <h3 id="modal-title" className="text-primary font-medium">
            {t('Create User')}
            <HelpTip label={t('About password resets')}>
              {t(
                'Password resets invalidate all browser sessions and signed links, not API keys.'
              )}
            </HelpTip>
          </h3>
          <Button
            variant="icon"
            onClick={onClose}
            disabled={loading}
            aria-label={t('Close modal')}
          >
            <i className="bi bi-x-lg icon-xl" />
          </Button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto p-6"
        >
          {error && (
            <div className="bg-red-bright/20 border-red-bright text-red-bright rounded border px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="create-email"
              className="text-muted mb-1 block text-sm font-semibold"
            >
              {t('Email')} <span className="text-red-bright">*</span>
            </label>
            <input
              id="create-email"
              type="email"
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              required
            />
          </div>

          <div>
            <label
              htmlFor="create-password"
              className="text-muted mb-1 block text-sm font-semibold"
            >
              {t('Password')} <span className="text-red-bright">*</span>
            </label>
            <input
              id="create-password"
              type="password"
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              required
              autoComplete="new-password"
            />
          </div>

          <div className="border-tertiary flex justify-end gap-3 border-t pt-4">
            <Button type="button" onClick={onClose} disabled={loading}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? t('Creating...') : t('Create')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
