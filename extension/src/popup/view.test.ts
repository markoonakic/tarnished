import { beforeEach, describe, expect, it } from 'vitest';

import {
  createPopupView,
  type JobInfo,
  type PopupState,
} from './view';

function setupDom() {
  document.body.innerHTML = `
    <div id="state-loading"></div>
    <div id="state-no-settings"></div>
    <div id="state-not-detected"></div>
    <div id="state-detected"></div>
    <div id="state-saved"></div>
    <div id="state-saving"></div>
    <div id="state-error"></div>
    <div id="autofillDetectedSection"></div>
    <div id="autofillSavedSection"></div>
    <div id="autofillOnlySection"></div>
    <span id="autofillDetectedCount"></span>
    <span id="autofillSavedCount"></span>
    <span id="autofillOnlyCount"></span>
    <span id="jobTitle"></span>
    <span id="jobCompany"></span>
    <span id="jobLocation"></span>
    <span id="savedJobTitle"></span>
    <span id="savedJobCompany"></span>
    <span id="savedJobLocation"></span>
    <span id="errorText"></span>
    <button id="retryBtn"></button>
    <button id="convertBtn"></button>
    <button id="viewBtn"></button>
  `;
}

describe('popup view', () => {
  beforeEach(() => {
    setupDom();
  });

  it('shows only the requested state container', () => {
    const view = createPopupView(document, {
      hasApplicationForm: false,
      fillableFieldCount: 0,
    });

    view.showState('saved');

    expect(document.getElementById('state-saved')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('state-loading')?.classList.contains('hidden')).toBe(true);
    expect(view.getCurrentState()).toBe('saved');
  });

  it('updates autofill counts and section visibility', () => {
    const view = createPopupView(document, {
      hasApplicationForm: true,
      fillableFieldCount: 3,
    });

    view.showState('detected');

    expect(document.getElementById('autofillDetectedCount')?.textContent).toBe('3 fields');
    expect(document.getElementById('autofillDetectedSection')?.classList.contains('hidden')).toBe(false);
  });

  it('updates job info and shows recoverable errors', () => {
    const view = createPopupView(document, {
      hasApplicationForm: false,
      fillableFieldCount: 0,
    });
    const info: JobInfo = {
      title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
    };

    view.updateJobInfoDisplay(info, 'savedJob');
    view.showError('Something broke', true);

    expect(document.getElementById('savedJobTitle')?.textContent).toBe('Engineer');
    expect(document.getElementById('savedJobCompany')?.textContent).toBe('Acme');
    expect(document.getElementById('savedJobLocation')?.textContent).toBe('Remote');
    expect(document.getElementById('errorText')?.textContent).toBe('Something broke');
    expect(document.getElementById('retryBtn')?.classList.contains('hidden')).toBe(false);
    expect(view.getCurrentState()).toBe('error' satisfies PopupState);
  });
});
