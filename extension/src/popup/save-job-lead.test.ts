import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPopupSaveLeadController } from './save-job-lead';

describe('popup save job lead controller', () => {
  const getCurrentTabText = vi.fn();
  const saveJobLead = vi.fn();
  const setJobStatus = vi.fn();
  const showState = vi.fn();
  const showError = vi.fn();
  const showErrorNotification = vi.fn();
  const showSuccessNotification = vi.fn();
  const updateJobInfoDisplay = vi.fn();

  const state: {
    currentTabUrl: string | null;
    currentJobInfo: {
      title: string | null;
      company: string | null;
      location: string | null;
    };
    existingLead: {
      id: string;
      title: string | null;
      company: string | null;
      location?: string | null;
    } | null;
  } = {
    currentTabUrl: 'https://example.com/jobs/1',
    currentJobInfo: { title: null, company: null, location: null },
    existingLead: null,
  };

  const elements = {
    savedMessage: { textContent: '' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    state.currentTabUrl = 'https://example.com/jobs/1';
    state.currentJobInfo = { title: null, company: null, location: null };
    state.existingLead = null;
    elements.savedMessage.textContent = '';
  });

  function createSubject() {
    return createPopupSaveLeadController({
      deps: {
        getCurrentTabText,
        saveJobLead,
        setJobStatus,
      },
      ui: {
        showState,
        showError,
        showErrorNotification,
        showSuccessNotification,
        updateJobInfoDisplay,
      },
      state,
      elements,
      mapApiError: (error) => error,
      getErrorMessage: (error) => String(error),
      isRecoverable: () => true,
    });
  }

  it('shows an error when no url is available', async () => {
    state.currentTabUrl = null;

    await createSubject().saveJobLead();

    expect(showError).toHaveBeenCalledWith('No URL to save');
    expect(showErrorNotification).toHaveBeenCalledWith('No URL to save');
  });

  it('saves the lead and updates popup state', async () => {
    getCurrentTabText.mockResolvedValue('job text');
    saveJobLead.mockResolvedValue({
      id: 'lead-1',
      title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
    });

    await createSubject().saveJobLead();

    expect(showState).toHaveBeenCalledWith('saving');
    expect(setJobStatus).toHaveBeenCalledWith('https://example.com/jobs/1', {
      url: 'https://example.com/jobs/1',
      isJobPage: true,
      existingLeadId: 'lead-1',
      title: 'Engineer',
      company: 'Acme',
    });
    expect(state.existingLead).toEqual({
      id: 'lead-1',
      title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
    });
    expect(elements.savedMessage.textContent).toBe('Saved to Job Leads');
    expect(showSuccessNotification).toHaveBeenCalledWith('Engineer', 'Acme');
    expect(showState).toHaveBeenCalledWith('saved');
  });
});
