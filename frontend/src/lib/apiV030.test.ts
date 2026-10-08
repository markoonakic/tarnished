import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { apiV030, queryParams } from './apiV030';

vi.mock('./api', () => ({ withAxiosTimeZoneHeaders: () => ({ 'Time-Zone': 'UTC' }), default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [api.get, api.post, api.patch, api.put, api.delete]) vi.mocked(method).mockResolvedValue({ data: { id: 'saved', revision: 2 } });
});

describe('v0.3 API contract', () => {
  it('uses repeated tag filters and retains false and zero', () => {
    const query = queryParams({ tags: ['Python', 'C++'], show_archived: false, page: 0, search: '', company_id: undefined });
    expect(query.getAll('tags')).toEqual(['Python', 'C++']);
    expect(query.get('show_archived')).toBe('false');
    expect(query.get('page')).toBe('0');
    expect(query.has('search')).toBe(false);
  });
  it('keeps revision and history input in the same status mutation', async () => {
    const input = { expected_revision: 1, status_id: 'rejected', status_changed_at: '2026-10-01T09:00:00Z', status_comment: 'Closed', status_reason: 'Position filled' };
    await apiV030.updateApplication('one', input);
    expect(api.patch).toHaveBeenCalledWith('/api/applications/one', input, { headers: { 'Time-Zone': 'UTC' } });
  });
  it('sends deletion revision and explicit account confirmation', async () => {
    await apiV030.deleteCompany('one', 3);
    expect(vi.mocked(api.delete).mock.calls[0][1]?.params.get('expected_revision')).toBe('3');
    await apiV030.deleteAccount('current password', true);
    expect(api.delete).toHaveBeenLastCalledWith('/api/auth/me', { data: { current_password: 'current password', confirm: true } });
  });
  it('does not lose reminder intent or item permissions', async () => {
    const reminder = { title: 'Call', kind: 'interview' as const, due_at: '2026-10-01T09:00:00Z', intent_id: 'intent' };
    await apiV030.createReminder(reminder);
    expect(api.post).toHaveBeenCalledWith('/api/reminders', reminder, { headers: { 'Time-Zone': 'UTC' } });
    const profile = { expected_revision: 1, ai_permissions: { projects: false, item: false } };
    await apiV030.updateProfile(profile);
    expect(api.put).toHaveBeenCalledWith('/api/profile', profile, { headers: { 'Time-Zone': 'UTC' } });
  });
  it('uploads a kind with the file and uses authenticated downloads', async () => {
    const file = new File(['portfolio'], 'portfolio.txt');
    await apiV030.uploadAttachment('one', 'portfolio', file);
    const form = vi.mocked(api.post).mock.calls[0][1] as FormData;
    expect(form.get('kind')).toBe('portfolio');
    expect(form.get('file')).toBe(file);
    await apiV030.downloadAttachment('document');
    expect(api.get).toHaveBeenCalledWith('/api/attachments/document', { responseType: 'blob' });
  });
});
