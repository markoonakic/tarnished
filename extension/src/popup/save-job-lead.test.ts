import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPopupSaveLeadController } from './save-job-lead';
import { DuplicateLeadError } from '../lib/api-core';
import { AlreadySavedError } from '../lib/errors';

vi.mock('../lib/storage', () => ({}));
vi.mock('../lib/logger', () => ({ debug: vi.fn(), warn: vi.fn() }));

describe('popup save job lead controller', () => {
  const getCurrentTabText = vi.fn();
  const saveJobLead = vi.fn();
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
    vi.resetAllMocks();
    getCurrentTabText.mockResolvedValue('job text');
    saveJobLead.mockResolvedValue({ id: 'lead-1', title: null, company: null });
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
    expect(state.existingLead).toEqual({
      id: 'lead-1',
      title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
    });
    expect(elements.savedMessage.textContent).toContain('Saved lead lead-1.');
    expect(elements.savedMessage.textContent).toContain(
      'Ready to convert without AI.'
    );
    expect(showSuccessNotification).toHaveBeenCalledWith('Engineer', 'Acme');
    expect(showState).toHaveBeenCalledWith('saved');
  });

  it('saves the URL when the content script cannot return page text', async () => {
    getCurrentTabText.mockRejectedValue(
      new Error('content script unavailable')
    );
    const result = await createSubject().saveJobLead();
    expect(saveJobLead).toHaveBeenCalledWith('https://example.com/jobs/1', '');
    expect(result?.lead.id).toBe('lead-1');
    expect(elements.savedMessage.textContent).toContain(
      'Page text unavailable'
    );
  });
  it.each([
    new DuplicateLeadError('Already saved', 'existing-1'),
    new AlreadySavedError('existing-1'),
  ])(
    'uses duplicate identity without a fallible read or overwrite: %s',
    async (error) => {
      saveJobLead.mockRejectedValue(error);
      const result = await createSubject().saveJobLead();
      expect(result?.created).toBe(false);
      expect(state.existingLead?.id).toBe('existing-1');
      expect(elements.savedMessage.textContent).toContain(
        'existing posting was not changed'
      );
      expect(showError).not.toHaveBeenCalled();
    }
  );
  it('does not resave an already known lead', async () => {
    state.existingLead = { id: 'known-1', title: null, company: null };
    const result = await createSubject().saveJobLead();
    expect(result?.created).toBe(false);
    expect(saveJobLead).not.toHaveBeenCalled();
    expect(getCurrentTabText).not.toHaveBeenCalled();
  });
  it('reports uncertain save outcome on network failure without claiming nothing was saved', async () => {
    saveJobLead.mockRejectedValue(new Error('timeout'));
    expect(await createSubject().saveJobLead()).toBeNull();
    expect(showError).toHaveBeenCalledWith(
      expect.stringContaining('Save outcome may be uncertain'),
      true
    );
  });
});
