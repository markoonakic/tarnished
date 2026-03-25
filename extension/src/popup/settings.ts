type SettingsState = {
  settingsOpen: boolean;
  autoFillOnLoad: boolean;
  existingLead: { id: string } | null;
  existingApplication: { id: string } | null;
};

type SettingsDeps = {
  setAutoFillOnLoad: (enabled: boolean) => Promise<void>;
  getAutoFillOnLoad: () => Promise<boolean>;
  openOptionsPage: () => Promise<void>;
  createTab: (options: { url: string }) => Promise<void>;
  getSettings: () => Promise<{ appUrl: string }>;
};

type SettingsElements = {
  settingsDropdown: HTMLElement | null;
  settingsBtn: HTMLElement | null;
  autoFillToggle: HTMLInputElement | null;
};

export function createPopupSettingsController(options: {
  deps: SettingsDeps;
  state: SettingsState;
  elements: SettingsElements;
  warn: (context: string, ...args: unknown[]) => void;
  logError: (context: string, ...args: unknown[]) => void;
}) {
  const { deps, state, elements, warn, logError } = options;

  function toggleSettingsDropdown(): void {
    state.settingsOpen = !state.settingsOpen;
    elements.settingsDropdown?.classList.toggle('hidden', !state.settingsOpen);
  }

  function handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (
      state.settingsOpen &&
      elements.settingsBtn &&
      !elements.settingsBtn.contains(target) &&
      elements.settingsDropdown &&
      !elements.settingsDropdown.contains(target)
    ) {
      state.settingsOpen = false;
      elements.settingsDropdown.classList.add('hidden');
    }
  }

  async function handleAutoFillToggle(): Promise<void> {
    state.autoFillOnLoad = elements.autoFillToggle?.checked ?? false;
    try {
      await deps.setAutoFillOnLoad(state.autoFillOnLoad);
    } catch (error) {
      warn('Popup', 'Failed to save autoFillOnLoad setting:', error);
    }
  }

  async function loadAutoFillSetting(): Promise<void> {
    try {
      state.autoFillOnLoad = await deps.getAutoFillOnLoad();
      if (elements.autoFillToggle) {
        elements.autoFillToggle.checked = state.autoFillOnLoad;
      }
    } catch (error) {
      warn('Popup', 'Failed to load autoFillOnLoad setting:', error);
    }
  }

  function openSettings(): void {
    deps.openOptionsPage().catch((error) => {
      logError('Popup', 'Failed to open settings:', error);
    });
  }

  async function openJobLeads(): Promise<void> {
    try {
      const settings = await deps.getSettings();
      const url = state.existingLead
        ? `${settings.appUrl}/job-leads/${state.existingLead.id}`
        : `${settings.appUrl}/job-leads`;
      await deps.createTab({ url });
    } catch (error) {
      logError('Popup', 'Failed to open job leads:', error);
    }
  }

  async function openApplications(applicationId?: string): Promise<void> {
    try {
      const settings = await deps.getSettings();
      const url = applicationId
        ? `${settings.appUrl}/applications/${applicationId}`
        : `${settings.appUrl}/applications`;
      await deps.createTab({ url });
    } catch (error) {
      logError('Popup', 'Failed to open applications:', error);
    }
  }

  return {
    toggleSettingsDropdown,
    handleDocumentClick,
    handleAutoFillToggle,
    loadAutoFillSetting,
    openSettings,
    openJobLeads,
    openApplications,
  };
}
