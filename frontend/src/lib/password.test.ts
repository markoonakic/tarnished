import { expect, it } from 'vitest';
import { newPasswordError } from './password';

it.each(['x', ' ', 'x'.repeat(64), 'é'.repeat(64), '😀'.repeat(64)])(
  'accepts non-empty passwords up to 64 Unicode characters',
  (password) => {
    expect(newPasswordError(password)).toBe('');
  }
);

it('rejects an empty password', () => {
  expect(newPasswordError('')).toBe('Password must not be empty.');
});

it.each(['x'.repeat(65), '😀'.repeat(65)])(
  'returns the inline error only above 64 Unicode characters',
  (password) => {
    expect(newPasswordError(password)).toBe('Use at most 64 characters.');
  }
);
