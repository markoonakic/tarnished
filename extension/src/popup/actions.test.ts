import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPopupActions } from './actions';
import type { SavedLead } from './save-job-lead';
import type { JobInfo } from './view';

vi.mock('../lib/storage', () => ({}));
vi.mock('../lib/logger', () => ({ debug: vi.fn(), warn: vi.fn() }));

describe('popup actions', () => {
  const saveJobLead = vi.fn();
  const getJobLead = vi.fn();
  const extractJobLead = vi.fn();
  const convertLeadToApplication = vi.fn();
  const showState = vi.fn();
  const showError = vi.fn();
  const showErrorNotification = vi.fn();
  const showNotification = vi.fn();
  const updateJobInfoDisplay = vi.fn();
  const lead: SavedLead = {
    id: 'lead-1',
    url: 'https://example.com/jobs/1',
    title: 'Engineer',
    company: 'Acme',
    status: 'pending',
    revision: 0,
  };
  const elements = {
    savedMessage: { textContent: '' },
    viewBtn: { textContent: '', dataset: {} as Record<string, string> },
    convertBtn: { classList: { add: vi.fn() } },
  };
  const state = {
    currentJobInfo: { title: null, company: null, location: null } as JobInfo,
    existingLead: lead as SavedLead | null,
    existingApplication: null as {
      id: string;
      job_title: string;
      company: string;
    } | null,
  };
  beforeEach(() => {
    vi.resetAllMocks();
    state.existingLead = { ...lead };
    state.existingApplication = null;
    elements.savedMessage.textContent = '';
    elements.viewBtn.dataset = {};
    saveJobLead.mockResolvedValue({ lead, created: true });
    getJobLead.mockResolvedValue(lead);
    extractJobLead.mockResolvedValue({
      ...lead,
      revision: 2,
      status: 'extracted',
    });
    convertLeadToApplication.mockResolvedValue({
      id: 'app-1',
      job_title: 'Engineer',
      company: 'Acme',
    });
  });
  function createSubject() {
    return createPopupActions({
      deps: {
        saveJobLead,
        getJobLead,
        extractJobLead,
        convertLeadToApplication,
      },
      ui: {
        showState,
        showError,
        showErrorNotification,
        showNotification,
        updateJobInfoDisplay,
      },
      state,
      elements,
      mapApiError: (error) => error,
      getErrorMessage: (error) => String(error),
    });
  }
  it('saves before explicit extraction and conversion, never calling direct application extraction', async () => {
    await createSubject().saveAsApplication();
    expect(saveJobLead.mock.invocationCallOrder[0]).toBeLessThan(
      extractJobLead.mock.invocationCallOrder[0]
    );
    expect(extractJobLead).toHaveBeenCalledExactlyOnceWith('lead-1', 0);
    expect(extractJobLead.mock.invocationCallOrder[0]).toBeLessThan(
      convertLeadToApplication.mock.invocationCallOrder[0]
    );
    expect(state.existingLead?.id).toBe('lead-1');
    expect(state.existingApplication?.id).toBe('app-1');
    expect(elements.viewBtn.dataset.applicationId).toBe('app-1');
  });
  it.each([
    new Error('AI unavailable'),
    new Error('Network timeout'),
    new Error('409 stale revision'),
  ])(
    'keeps saved identity and open/review guidance after extraction failure: %s',
    async (error) => {
      extractJobLead.mockRejectedValue(error);
      await createSubject().saveAsApplication();
      expect(state.existingLead?.id).toBe('lead-1');
      expect(elements.savedMessage.textContent).toContain(
        'Lead lead-1 is saved.'
      );
      expect(elements.savedMessage.textContent).toContain(
        'No automatic AI retry'
      );
      expect(showState).toHaveBeenLastCalledWith('saved');
      expect(showError).not.toHaveBeenCalled();
      expect(convertLeadToApplication).not.toHaveBeenCalled();
    }
  );
  it('does not overwrite or enrich an existing lead on a duplicate combined action', async () => {
    saveJobLead.mockResolvedValue({ lead, created: false });
    await createSubject().saveAsApplication();
    expect(extractJobLead).not.toHaveBeenCalled();
    expect(convertLeadToApplication).not.toHaveBeenCalled();
  });
  it('does not extract if save failed', async () => {
    saveJobLead.mockResolvedValue(null);
    await createSubject().saveAsApplication();
    expect(extractJobLead).not.toHaveBeenCalled();
  });
  it('converts manually ready pending or failed leads without AI', async () => {
    for (const status of ['pending', 'failed'] as const) {
      getJobLead.mockResolvedValue({ ...lead, status });
      await createSubject().handleConvertToApplication();
    }
    expect(convertLeadToApplication).toHaveBeenCalledTimes(2);
    expect(extractJobLead).not.toHaveBeenCalled();
    expect(state.existingLead?.id).toBe('lead-1');
    expect(elements.savedMessage.textContent).toBe('Added as Application');
  });
  it.each(['pending', 'processing', 'failed'] as const)(
    'explains incomplete/processing state %s without paid work',
    async (status) => {
      getJobLead.mockResolvedValue({ ...lead, title: null, status });
      await createSubject().handleConvertToApplication();
      expect(convertLeadToApplication).not.toHaveBeenCalled();
      expect(extractJobLead).not.toHaveBeenCalled();
      expect(elements.savedMessage.textContent).toContain(
        status === 'processing' ? 'interrupted' : 'manually'
      );
    }
  );
  it('retains the lead when refresh or conversion has an uncertain network result', async () => {
    getJobLead.mockRejectedValueOnce(new Error('offline'));
    const subject = createSubject();
    await subject.handleConvertToApplication();
    expect(state.existingLead?.id).toBe('lead-1');
    convertLeadToApplication.mockRejectedValueOnce(new Error('timeout'));
    await subject.handleConvertToApplication();
    expect(state.existingLead?.id).toBe('lead-1');
    expect(elements.savedMessage.textContent).toContain('uncertain');
  });
  it('uses the idempotent conversion endpoint for an existing conversion', async () => {
    getJobLead.mockResolvedValue({
      ...lead,
      title: null,
      status: 'converted',
      converted_to_application_id: 'app-1',
    });
    await createSubject().handleConvertToApplication();
    expect(convertLeadToApplication).toHaveBeenCalledExactlyOnceWith('lead-1');
    expect(state.existingApplication?.id).toBe('app-1');
  });
  it('ignores a second combined click while extraction is running', async () => {
    let finish!: (lead: SavedLead) => void;
    extractJobLead.mockReturnValue(
      new Promise<SavedLead>((resolve) => {
        finish = resolve;
      })
    );
    const subject = createSubject();
    const first = subject.saveAsApplication();
    await vi.waitFor(() => expect(extractJobLead).toHaveBeenCalledOnce());
    await subject.saveAsApplication();
    expect(saveJobLead).toHaveBeenCalledOnce();
    finish(lead);
    await first;
  });
});
