import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPopupStateController } from './state';

describe('popup state controller', () => {
  const getSettings = vi.fn();
  const queryTabs = vi.fn();
  const getTabStatus = vi.fn();
  const getDetection = vi.fn();
  const getFormDetection = vi.fn();
  const checkExistingLead = vi.fn();
  const checkExistingApplication = vi.fn();
  const extractTitle = vi.fn();
  const extractCompany = vi.fn();
  const extractLocation = vi.fn();
  const showState = vi.fn();
  const showError = vi.fn();
  const updateJobInfoDisplay = vi.fn();
  const setFormDetectionState = vi.fn();
  const warn = vi.fn();

  const state = {
    currentTabId: null as number | null,
    currentTabUrl: null as string | null,
    currentJobInfo: { title: null, company: null, location: null },
    existingLead: null as {
      id: string;
      title: string | null;
      company: string | null;
      location?: string | null;
    } | null,
    existingApplication: null as {
      id: string;
      job_title: string;
      company: string;
      location?: string | null;
    } | null,
  };

  const elements = {
    savedMessage: { textContent: '' },
    convertBtn: { classList: { add: vi.fn(), remove: vi.fn() } },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    state.currentTabId = null;
    state.currentTabUrl = null;
    state.currentJobInfo = { title: null, company: null, location: null };
    state.existingLead = null;
    state.existingApplication = null;
    elements.savedMessage.textContent = '';
  });

  function createSubject() {
    return createPopupStateController({
      deps: {
        getSettings,
        queryTabs,
        getTabStatus,
        getDetection,
        getFormDetection,
        checkExistingLead,
        checkExistingApplication,
        isRestrictedUrl: (url) => url.startsWith('chrome://'),
        extractTitle,
        extractCompany,
        extractLocation,
      },
      ui: {
        showState,
        showError,
        updateJobInfoDisplay,
        setFormDetectionState,
      },
      state,
      elements,
      warn,
      getErrorMessage: (error) => String(error),
      isRecoverable: () => true,
    });
  }

  it('shows no-settings when extension settings are incomplete', async () => {
    getSettings.mockResolvedValue({ appUrl: '', apiKey: '' });

    await createSubject().determineState();

    expect(showState).toHaveBeenCalledWith('loading');
    expect(showState).toHaveBeenCalledWith('no-settings');
  });

  it('shows saved state for an existing lead', async () => {
    getSettings.mockResolvedValue({ appUrl: 'https://app', apiKey: 'key' });
    queryTabs.mockResolvedValue([{ id: 5, url: 'https://example.com/job' }]);
    getTabStatus.mockResolvedValue(null);
    getDetection.mockResolvedValue({ isJobPage: true, score: 5, signals: [] });
    getFormDetection.mockResolvedValue({
      hasApplicationForm: true,
      fillableFieldCount: 2,
    });
    checkExistingLead.mockResolvedValue({
      id: 'lead-1',
      title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
    });
    checkExistingApplication.mockResolvedValue(null);

    await createSubject().determineState();

    expect(setFormDetectionState).toHaveBeenCalledWith({
      hasApplicationForm: true,
      fillableFieldCount: 2,
    });
    expect(elements.savedMessage.textContent).toBe('Saved to Job Leads');
    expect(updateJobInfoDisplay).toHaveBeenCalledWith(
      { title: 'Engineer', company: 'Acme', location: 'Remote' },
      'savedJob'
    );
    expect(showState).toHaveBeenCalledWith('saved');
  });

  it('shows detected state for a new job page', async () => {
    getSettings.mockResolvedValue({ appUrl: 'https://app', apiKey: 'key' });
    queryTabs.mockResolvedValue([{ id: 7, url: 'https://example.com/job' }]);
    getTabStatus.mockResolvedValue({
      isJobPage: true,
      score: 9,
      signals: [],
      url: 'https://example.com/job',
    });
    getFormDetection.mockResolvedValue(null);
    checkExistingLead.mockResolvedValue(null);
    checkExistingApplication.mockResolvedValue(null);
    extractTitle.mockReturnValue('Senior Engineer');
    extractCompany.mockReturnValue('Acme');
    extractLocation.mockReturnValue('Remote');

    await createSubject().determineState();

    expect(updateJobInfoDisplay).toHaveBeenCalledWith(
      { title: 'Senior Engineer', company: 'Acme', location: 'Remote' },
      'job'
    );
    expect(showState).toHaveBeenCalledWith('detected');
  });
});
