import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('./api', () => ({
  default: {
    get,
  },
}));

describe('admin api helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('passes pagination and search params when listing users', async () => {
    get.mockResolvedValueOnce({
      data: {
        items: [],
        total: 0,
        page: 2,
        per_page: 50,
        total_pages: 1,
      },
    });

    const { listUsers } = await import('./admin');

    await listUsers({ page: 2, per_page: 50, query: 'alice' });

    expect(get).toHaveBeenCalledWith('/api/admin/users', {
      params: {
        page: 2,
        per_page: 50,
        query: 'alice',
      },
    });
  });
});
