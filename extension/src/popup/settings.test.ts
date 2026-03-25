import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPopupSettingsController } from './settings';

describe('popup settings controller', () => {
  const setAutoFillOnLoad = vi.fn();
  const getAutoFillOnLoad = vi.fn();
  const openOptionsPage = vi.fn();
  const createTab = vi.fn();
  const getSettings = vi.fn();
  const logError = vi.fn();
  const warn = vi.fn();

  const state = {
    settingsOpen: false,
    autoFillOnLoad: false,
    existingLead: { id: 'lead-1' } as { id: string } | null,
    existingApplication: { id: 'app-1' } as { id: string } | null,
  };

  const settingsDropdown = document.createElement('div');
  const settingsBtn = document.createElement('button');
  const autoFillToggle = document.createElement('input');
  autoFillToggle.type = 'checkbox';

  beforeEach(() => {
    vi.clearAllMocks();
    state.settingsOpen = false;
    state.autoFillOnLoad = false;
    state.existingLead = { id: 'lead-1' };
    state.existingApplication = { id: 'app-1' };
    settingsDropdown.className = 'hidden';
    autoFillToggle.checked = false;
  });

  function createSubject() {
    return createPopupSettingsController({
      deps: {
        setAutoFillOnLoad,
        getAutoFillOnLoad,
        openOptionsPage,
        createTab,
        getSettings,
      },
      state,
      elements: {
        settingsDropdown,
        settingsBtn,
        autoFillToggle,
      },
      warn,
      logError,
    });
  }

  it('toggles settings dropdown visibility', () => {
    const subject = createSubject();

    subject.toggleSettingsDropdown();
    expect(state.settingsOpen).toBe(true);
    expect(settingsDropdown.classList.contains('hidden')).toBe(false);

    subject.toggleSettingsDropdown();
    expect(state.settingsOpen).toBe(false);
    expect(settingsDropdown.classList.contains('hidden')).toBe(true);
  });

  it('loads and saves autofill preference', async () => {
    getAutoFillOnLoad.mockResolvedValue(true);
    const subject = createSubject();

    await subject.loadAutoFillSetting();
    expect(state.autoFillOnLoad).toBe(true);
    expect(autoFillToggle.checked).toBe(true);

    autoFillToggle.checked = false;
    await subject.handleAutoFillToggle();
    expect(state.autoFillOnLoad).toBe(false);
    expect(setAutoFillOnLoad).toHaveBeenCalledWith(false);
  });

  it('opens app pages with the correct urls', async () => {
    getSettings.mockResolvedValue({ appUrl: 'https://app.example.com' });
    const subject = createSubject();

    await subject.openJobLeads();
    await subject.openApplications('app-2');

    expect(createTab).toHaveBeenNthCalledWith(1, {
      url: 'https://app.example.com/job-leads/lead-1',
    });
    expect(createTab).toHaveBeenNthCalledWith(2, {
      url: 'https://app.example.com/applications/app-2',
    });
  });
});
