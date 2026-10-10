import { afterEach, expect, it, vi } from 'vitest';
import api from './api';
import { deleteApplication } from './applications';
import { deleteJobLead } from './jobLeads';
afterEach(() => vi.restoreAllMocks());
it('sends the displayed revision for lead and application deletion', async () => {
  vi.spyOn(api, 'delete').mockResolvedValue({});
  await deleteApplication('app', 7);
  await deleteJobLead('lead', 3);
  expect(api.delete).toHaveBeenCalledWith('/api/applications/app', {
    headers: { 'Expected-Evidence-Revision': 7 },
  });
  expect(api.delete).toHaveBeenCalledWith('/api/job-leads/lead', {
    headers: { 'Expected-Revision': 3 },
  });
});
