export const PASSWORD_POLICY =
  'Use at least 12 characters and at most 72 UTF-8 bytes. Spaces are allowed.';

export function validNewPassword(password: string): boolean {
  return (
    Array.from(password).length >= 12 &&
    new TextEncoder().encode(password).length <= 72
  );
}
