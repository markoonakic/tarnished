export function newPasswordError(password: string): string {
  if (!password) return 'Password must not be empty.';
  return Array.from(password).length > 64 ? 'Use at most 64 characters.' : '';
}
