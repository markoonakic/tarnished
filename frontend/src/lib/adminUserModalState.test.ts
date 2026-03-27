import { describe, expect, it } from 'vitest';

import {
  buildUserUpdatePayload,
  getCreateUserModalState,
  getEditUserModalState,
} from './adminUserModalState';

describe('admin user modal state helpers', () => {
  it('returns a clean create-user modal state', () => {
    expect(getCreateUserModalState()).toEqual({
      email: '',
      password: '',
      error: '',
    });
  });

  it('hydrates edit-user modal state from the selected user', () => {
    expect(
      getEditUserModalState({
        id: 'user-1',
        email: 'alice@example.com',
        is_admin: true,
        is_active: false,
      })
    ).toEqual({
      isAdmin: true,
      isActive: false,
      password: '',
      error: '',
    });
  });

  it('builds an update payload without a password when unchanged', () => {
    expect(
      buildUserUpdatePayload({
        isAdmin: true,
        isActive: false,
        password: '',
      })
    ).toEqual({
      is_admin: true,
      is_active: false,
    });
  });

  it('includes the password only when the admin entered one', () => {
    expect(
      buildUserUpdatePayload({
        isAdmin: false,
        isActive: true,
        password: 'new-secret',
      })
    ).toEqual({
      is_admin: false,
      is_active: true,
      password: 'new-secret',
    });
  });
});
