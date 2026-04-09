import { beforeEach, describe, expect, it, vi } from 'vitest';

const { del, get, patch, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('./api', () => ({
  default: {
    get,
    post,
    patch,
    delete: del,
  },
}));

describe('settings api helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('lists api keys from the multi-key endpoint', async () => {
    get.mockResolvedValueOnce({ data: [] });

    const { listAPIKeys } = await import('./settings');

    await listAPIKeys();

    expect(get).toHaveBeenCalledWith('/api/settings/api-keys');
  });

  it('creates a named api key', async () => {
    post.mockResolvedValueOnce({ data: { id: 'key-1' } });

    const { createAPIKey } = await import('./settings');

    await createAPIKey({ label: 'MacBook CLI' });

    expect(post).toHaveBeenCalledWith('/api/settings/api-keys', {
      label: 'MacBook CLI',
    });
  });

  it('renames an api key', async () => {
    patch.mockResolvedValueOnce({ data: { id: 'key-1', label: 'New Label' } });

    const { updateAPIKey } = await import('./settings');

    await updateAPIKey('key-1', { label: 'New Label' });

    expect(patch).toHaveBeenCalledWith('/api/settings/api-keys/key-1', {
      label: 'New Label',
    });
  });

  it('revokes an api key', async () => {
    del.mockResolvedValueOnce({ data: null });

    const { deleteAPIKey } = await import('./settings');

    await deleteAPIKey('key-1');

    expect(del).toHaveBeenCalledWith('/api/settings/api-keys/key-1');
  });
});
