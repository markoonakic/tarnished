import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPopupActions } from './actions';

describe('popup actions', () => {
  const getStatuses = vi.fn();
  const extractApplication = vi.fn();
  const convertLeadToApplication = vi.fn();
  const getCurrentTabText = vi.fn();
  const showState = vi.fn();
  const showError = vi.fn();
  const showErrorNotification = vi.fn();
  const showApplicationSuccessNotification = vi.fn();
  const showNotification = vi.fn();
  const updateJobInfoDisplay = vi.fn();

  const elements = {
    savedMessage: { textContent: '' },
    viewBtn: { textContent: '', dataset: {} as Record<string, string> },
    convertBtn: { classList: { add: vi.fn() } },
  };

  const state = {
    currentTabUrl: 'https://example.com/jobs/1',
    currentJobInfo: { title: null, company: null, location: null },
    existingLead: { id: 'lead-1' },
    existingApplication: null,
    appliedStatusId: null as string | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    state.currentTabUrl = 'https://example.com/jobs/1';
    state.currentJobInfo = { title: null, company: null, location: null };
    state.existingLead = { id: 'lead-1' };
    state.existingApplication = null;
    state.appliedStatusId = null;
    elements.savedMessage.textContent = '';
    elements.viewBtn.textContent = '';
    elements.viewBtn.dataset = {};
  });

  function createSubject() {
    return createPopupActions({
      deps: {
        getStatuses,
        extractApplication,
        convertLeadToApplication,
        getCurrentTabText,
      },
      ui: {
        showState,
        showError,
        showErrorNotification,
        showApplicationSuccessNotification,
        showNotification,
        updateJobInfoDisplay,
      },
      state,
      elements,
      debug: vi.fn(),
      warn: vi.fn(),
      mapApiError: (error) => error,
      getErrorMessage: (error) => String(error),
      isRecoverable: () => true,
    });
  }

  it('caches the applied status id after the first lookup', async () => {
    getStatuses.mockResolvedValue([{ id: 'status-1', name: 'Applied' }]);
    const subject = createSubject();

    await expect(subject.getAppliedStatusId()).resolves.toBe('status-1');
    await expect(subject.getAppliedStatusId()).resolves.toBe('status-1');

    expect(getStatuses).toHaveBeenCalledTimes(1);
  });

  it('shows an error when saving as application without an applied status', async () => {
    getStatuses.mockResolvedValue([{ id: 'status-2', name: 'Wishlist' }]);
    const subject = createSubject();

    await subject.saveAsApplication();

    expect(showState).toHaveBeenCalledWith('saving');
    expect(showError).toHaveBeenCalled();
    expect(showErrorNotification).toHaveBeenCalled();
    expect(extractApplication).not.toHaveBeenCalled();
  });

  it('converts a lead to an application and updates saved state', async () => {
    convertLeadToApplication.mockResolvedValue({
      id: 'app-1',
      job_title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
    });
    const subject = createSubject();

    await subject.handleConvertToApplication();

    expect(state.existingLead).toBeNull();
    expect(state.existingApplication).toEqual(
      expect.objectContaining({ id: 'app-1' })
    );
    expect(elements.savedMessage.textContent).toBe('Added as Application');
    expect(elements.viewBtn.dataset.applicationId).toBe('app-1');
    expect(showState).toHaveBeenCalledWith('saved');
    expect(showNotification).toHaveBeenCalledWith(
      'Converted!',
      'Job lead converted to application.'
    );
  });
});
