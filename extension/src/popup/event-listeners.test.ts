import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { bindPopupEventListeners } from './event-listeners';
import { createPopupSettingsController } from './settings';

const popupHtml = readFileSync('public/popup/popup.html', 'utf8');

function createPopup(html = popupHtml) {
  const popupDocument = new DOMParser().parseFromString(html, 'text/html');
  const elements = {
    settingsBtn: popupDocument.getElementById('settingsBtn'),
    openSettingsBtn: popupDocument.getElementById('openSettingsBtn'),
    openSettingsFromDropdown: popupDocument.getElementById(
      'openSettingsFromDropdown'
    ),
    autoFillToggle:
      popupDocument.querySelector<HTMLInputElement>('#autoFillToggle'),
    saveAsLeadBtn: popupDocument.getElementById('saveAsLeadBtn'),
    saveAsApplicationBtn: popupDocument.getElementById('saveAsApplicationBtn'),
    viewBtn: popupDocument.getElementById('viewBtn'),
    convertBtn: popupDocument.getElementById('convertBtn'),
    retryBtn: popupDocument.getElementById('retryBtn'),
    autofillBtnDetected: popupDocument.getElementById('autofillBtnDetected'),
    autofillBtnSaved: popupDocument.getElementById('autofillBtnSaved'),
    autofillBtnOnly: popupDocument.getElementById('autofillBtnOnly'),
    settingsDropdown: popupDocument.getElementById('settingsDropdown'),
  };
  const state = {
    settingsOpen: false,
    autoFillOnLoad: false,
    existingLead: null as { id: string } | null,
    existingApplication: null as { id: string } | null,
  };
  const deps = {
    setAutoFillOnLoad: vi.fn().mockResolvedValue(undefined),
    getAutoFillOnLoad: vi.fn().mockResolvedValue(false),
    openOptionsPage: vi.fn().mockResolvedValue(undefined),
    createTab: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({
      appUrl: 'https://tarnished.example',
    }),
  };
  const settings = createPopupSettingsController({
    deps,
    state,
    elements,
    warn: vi.fn(),
    logError: vi.fn(),
  });
  const actionCalls: string[] = [];
  const handleDocumentClick = vi.fn(settings.handleDocumentClick);

  bindPopupEventListeners({
    elements,
    document: popupDocument,
    toggleSettingsDropdown: settings.toggleSettingsDropdown,
    openSettings: settings.openSettings,
    closeSettingsDropdown: () => {
      state.settingsOpen = false;
    },
    handleAutoFillToggle: settings.handleAutoFillToggle,
    handleDocumentClick,
    saveJobLead: () => {
      actionCalls.push('save-lead');
    },
    saveAsApplication: () => {
      actionCalls.push('save-application');
    },
    openJobLeads: settings.openJobLeads,
    openApplications: settings.openApplications,
    getExistingApplicationId: () => state.existingApplication?.id ?? null,
    handleConvertToApplication: () => {
      actionCalls.push('convert');
    },
    retryAction: () => {
      actionCalls.push('retry');
    },
    autofillFormHandler: () => {
      actionCalls.push('autofill');
    },
  });

  return {
    document: popupDocument,
    elements,
    state,
    deps,
    actionCalls,
    handleDocumentClick,
  };
}

describe('popup event listeners', () => {
  it.each([
    {
      name: 'prefers a new application over an existing application and lead',
      newId: 'app-new',
      existingId: 'app-existing',
      leadId: 'lead-1',
      url: 'https://tarnished.example/applications/app-new',
    },
    {
      name: 'opens an existing application when no new ID is present',
      newId: undefined,
      existingId: 'app-existing',
      leadId: null,
      url: 'https://tarnished.example/applications/app-existing',
    },
    {
      name: 'treats a blank new ID as absent',
      newId: '',
      existingId: 'app-existing',
      leadId: 'lead-1',
      url: 'https://tarnished.example/applications/app-existing',
    },
    {
      name: 'opens the saved lead when neither application ID is present',
      newId: undefined,
      existingId: null,
      leadId: 'lead-1',
      url: 'https://tarnished.example/job-leads/lead-1',
    },
    {
      name: 'opens the lead list when IDs are blank and no lead is saved',
      newId: '',
      existingId: '',
      leadId: null,
      url: 'https://tarnished.example/job-leads',
    },
  ])('$name on a View click', async ({ newId, existingId, leadId, url }) => {
    const { elements, state, deps } = createPopup();
    expect(deps.getSettings).not.toHaveBeenCalled();
    expect(deps.createTab).not.toHaveBeenCalled();

    // State can arrive after binding; navigation must use the click-time values.
    state.existingApplication = existingId === null ? null : { id: existingId };
    state.existingLead = leadId === null ? null : { id: leadId };
    if (newId !== undefined) elements.viewBtn!.dataset.applicationId = newId;
    elements.viewBtn!.click();

    await vi.waitFor(() =>
      expect(deps.createTab).toHaveBeenCalledExactlyOnceWith({ url })
    );
  });

  it('drives settings visibility, options and preference through DOM events', () => {
    const { document, elements, state, deps, handleDocumentClick } =
      createPopup();
    expect(deps.openOptionsPage).not.toHaveBeenCalled();
    expect(deps.setAutoFillOnLoad).not.toHaveBeenCalled();

    elements.settingsBtn!.click();
    expect(state.settingsOpen).toBe(true);
    expect(elements.settingsDropdown!.classList.contains('hidden')).toBe(false);
    expect(handleDocumentClick).not.toHaveBeenCalled();

    elements.autoFillToggle!.click();
    expect(deps.setAutoFillOnLoad).toHaveBeenCalledExactlyOnceWith(true);
    expect(state.settingsOpen).toBe(true);
    document.body.click();
    expect(state.settingsOpen).toBe(false);
    expect(elements.settingsDropdown!.classList.contains('hidden')).toBe(true);

    elements.settingsBtn!.click();
    elements.openSettingsFromDropdown!.click();
    expect(state.settingsOpen).toBe(false);
    expect(elements.settingsDropdown!.classList.contains('hidden')).toBe(true);
    expect(deps.openOptionsPage).toHaveBeenCalledOnce();
    elements.openSettingsBtn!.click();
    expect(deps.openOptionsPage).toHaveBeenCalledTimes(2);
  });

  it('dispatches the supplied actions only when their controls are clicked', () => {
    const { elements, actionCalls } = createPopup();
    expect(actionCalls).toEqual([]);

    elements.saveAsLeadBtn!.click();
    elements.saveAsApplicationBtn!.click();
    elements.convertBtn!.click();
    elements.retryBtn!.click();
    elements.autofillBtnDetected!.click();
    elements.autofillBtnSaved!.click();
    elements.autofillBtnOnly!.click();

    expect(actionCalls).toEqual([
      'save-lead',
      'save-application',
      'convert',
      'retry',
      'autofill',
      'autofill',
      'autofill',
    ]);
  });

  it('still delivers document clicks when optional popup controls are absent', () => {
    const { document, deps, actionCalls, handleDocumentClick } =
      createPopup('');
    document.body.click();

    expect(handleDocumentClick).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ target: document.body })
    );
    expect(actionCalls).toEqual([]);
    expect(deps.createTab).not.toHaveBeenCalled();
    expect(deps.openOptionsPage).not.toHaveBeenCalled();
  });
});
