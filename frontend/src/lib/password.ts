import { t } from '@/lib/i18n';
export function newPasswordError(password: string): string {
  if (!password) return t('Password must not be empty.');
  return Array.from(password).length > 64
    ? t('Use at most 64 characters.')
    : '';
}
