export function getCreateUserModalState(): {
  email: string;
  password: string;
  error: string;
} {
  return {
    email: '',
    password: '',
    error: '',
  };
}

export function getEditUserModalState<
  T extends {
    is_admin: boolean;
    is_active: boolean;
  },
>(
  user: T
): {
  isAdmin: boolean;
  isActive: boolean;
  password: string;
  error: string;
} {
  return {
    isAdmin: user.is_admin,
    isActive: user.is_active,
    password: '',
    error: '',
  };
}

export function buildUserUpdatePayload(values: {
  isAdmin: boolean;
  isActive: boolean;
  password: string;
}): { is_admin: boolean; is_active: boolean; password?: string } {
  return {
    is_admin: values.isAdmin,
    is_active: values.isActive,
    ...(values.password ? { password: values.password } : {}),
  };
}
