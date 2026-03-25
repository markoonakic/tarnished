import { describe, expect, it, vi } from 'vitest';

import {
  bindPopupEventListeners,
  resolvePopupViewNavigation,
} from './event-listeners';

describe('popup event listeners', () => {
  it('prefers a newly created application when resolving view navigation', () => {
    expect(
      resolvePopupViewNavigation({
        newApplicationId: 'app-1',
        existingApplicationId: 'app-2',
        existingLeadId: 'lead-1',
      })
    ).toEqual({ kind: 'application', id: 'app-1' });
  });

  it('falls back to job leads when no application id is available', () => {
    expect(
      resolvePopupViewNavigation({
        newApplicationId: null,
        existingApplicationId: null,
        existingLeadId: 'lead-1',
      })
    ).toEqual({ kind: 'jobLeads' });
  });

  it('registers popup button handlers through the shared binding helper', () => {
    const makeElement = () => ({ addEventListener: vi.fn(), classList: { add: vi.fn() } });
    const elements = {
      settingsBtn: makeElement(),
      openSettingsBtn: makeElement(),
      openSettingsFromDropdown: makeElement(),
      autoFillToggle: makeElement(),
      saveAsLeadBtn: makeElement(),
      saveAsApplicationBtn: makeElement(),
      viewBtn: { ...makeElement(), dataset: {} },
      convertBtn: makeElement(),
      retryBtn: makeElement(),
      autofillBtnDetected: makeElement(),
      autofillBtnSaved: makeElement(),
      autofillBtnOnly: makeElement(),
      settingsDropdown: makeElement(),
    };
    const documentLike = { addEventListener: vi.fn() } as unknown as Document;

    bindPopupEventListeners({
      elements,
      document: documentLike,
      toggleSettingsDropdown: vi.fn(),
      openSettings: vi.fn(),
      closeSettingsDropdown: vi.fn(),
      handleAutoFillToggle: vi.fn(),
      handleDocumentClick: vi.fn(),
      saveJobLead: vi.fn(),
      saveAsApplication: vi.fn(),
      openJobLeads: vi.fn(),
      openApplications: vi.fn(),
      getExistingApplicationId: () => null,
      getExistingLeadId: () => null,
      handleConvertToApplication: vi.fn(),
      retryAction: vi.fn(),
      autofillFormHandler: vi.fn(),
    });

    expect(elements.settingsBtn.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(documentLike.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(elements.autofillBtnOnly.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
  });
});
