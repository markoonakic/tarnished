import type { JobLeadResponse } from '../lib/api-core';
import { DuplicateLeadError } from '../lib/api-core';
import { AlreadySavedError } from '../lib/errors';
import type { JobInfo } from './view';

// A duplicate response supplies identity even if a follow-up read is unavailable.
export type SavedLead = Pick<JobLeadResponse, 'id' | 'title' | 'company'> &
  Partial<JobLeadResponse>;

export function describeSavedLead(lead: SavedLead): string {
  const identity = `Saved lead ${lead.id}.`;
  if (lead.converted_to_application_id || lead.status === 'converted') {
    return `${identity} Already converted; open in app to view the application.`;
  }
  if (lead.status === 'processing') {
    return `${identity} Processing may still be running or interrupted. Open in app to review; restarting may repeat billed work.`;
  }
  const ready = lead.title?.trim() && lead.company?.trim();
  const status =
    lead.status === 'failed'
      ? 'Extraction failed; posting retained.'
      : lead.status === 'extracted'
        ? 'Extracted.'
        : lead.status === 'pending'
          ? 'Not extracted; no background job is queued.'
          : 'Processing state unavailable; open in app to review.';
  return `${identity} ${status} ${ready ? 'Ready to convert without AI.' : 'Open in app to complete company/title manually or explicitly extract with AI.'}${lead.content_warning ? ` ${lead.content_warning}` : ''}${lead.source_truncated ? ' Source was truncated.' : ''}`;
}

export function createPopupSaveLeadController(options: {
  deps: {
    getCurrentTabText: () => Promise<string>;
    saveJobLead: (url: string, text: string) => Promise<SavedLead>;
  };
  ui: {
    showState: (state: 'saving' | 'saved') => void;
    showError: (message: string, recoverable?: boolean) => void;
    showErrorNotification: (message: string) => void;
    showSuccessNotification: (
      title: string | null,
      company: string | null
    ) => void;
    updateJobInfoDisplay: (info: JobInfo, prefix: 'savedJob') => void;
  };
  state: {
    currentTabUrl: string | null;
    currentJobInfo: JobInfo;
    existingLead: SavedLead | null;
  };
  elements: {
    savedMessage: { textContent: string | null } | null;
    convertBtn?: { classList: { remove: (token: string) => void } } | null;
  };
  mapApiError: (error: unknown) => unknown;
  getErrorMessage: (error: unknown) => string;
  isRecoverable: (error: unknown) => boolean;
}) {
  const {
    deps,
    ui,
    state,
    elements,
    mapApiError,
    getErrorMessage,
    isRecoverable,
  } = options;
  let saving = false;

  async function saveJobLead(): Promise<{
    lead: SavedLead;
    created: boolean;
  } | null> {
    if (saving) return null;
    const url = state.currentTabUrl;
    if (!url) {
      ui.showError('No URL to save');
      ui.showErrorNotification('No URL to save');
      return null;
    }
    saving = true;
    ui.showState('saving');
    let created = false;
    let warning = '';
    try {
      let result = state.existingLead;
      if (!result) {
        let text = '';
        try {
          text = await deps.getCurrentTabText();
        } catch {
          warning = ' Page text unavailable; URL saved.';
        }
        try {
          result = await deps.saveJobLead(url, text);
          created = true;
        } catch (error) {
          if (
            (error instanceof DuplicateLeadError ||
              error instanceof AlreadySavedError) &&
            error.existingId
          ) {
            result = { id: error.existingId, url, title: null, company: null };
          } else {
            throw error;
          }
        }
      }
      state.existingLead = result;
      state.currentJobInfo = {
        title: result.title,
        company: result.company,
        location: result.location || null,
      };
      if (elements.savedMessage) {
        elements.savedMessage.textContent = `${created ? '' : 'Already saved; existing posting was not changed. '}${describeSavedLead(result)}${warning}`;
      }
      elements.convertBtn?.classList.remove('hidden');
      ui.updateJobInfoDisplay(state.currentJobInfo, 'savedJob');
      ui.showState('saved');
      ui.showSuccessNotification(result.title, result.company);
      return { lead: result, created };
    } catch (error) {
      const extensionError = mapApiError(error);
      const message = `${getErrorMessage(extensionError)} Save outcome may be uncertain; check Job Leads before saving again.`;
      ui.showError(message, isRecoverable(extensionError));
      ui.showErrorNotification(message);
      return null;
    } finally {
      saving = false;
    }
  }

  return { saveJobLead };
}
