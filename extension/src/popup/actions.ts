import { describeSavedLead, type SavedLead } from './save-job-lead';
import type { JobInfo } from './view';

type ApplicationLike = {
  id: string;
  job_title: string;
  company: string;
  location?: string | null;
};

export function createPopupActions(options: {
  deps: {
    saveJobLead: () => Promise<{ lead: SavedLead; created: boolean } | null>;
    getJobLead: (id: string) => Promise<SavedLead>;
    extractJobLead: (
      id: string,
      expectedRevision: number
    ) => Promise<SavedLead>;
    convertLeadToApplication: (leadId: string) => Promise<ApplicationLike>;
  };
  ui: {
    showState: (state: 'saving' | 'saved') => void;
    showError: (message: string, recoverable?: boolean) => void;
    showErrorNotification: (message: string) => void;
    showNotification: (title: string, message: string) => void;
    updateJobInfoDisplay: (info: JobInfo, prefix: 'savedJob') => void;
  };
  state: {
    currentJobInfo: JobInfo;
    existingLead: SavedLead | null;
    existingApplication: ApplicationLike | null;
  };
  elements: {
    savedMessage: { textContent: string | null } | null;
    viewBtn: { textContent: string; dataset: Record<string, string> } | null;
    convertBtn: { classList: { add: (token: string) => void } } | null;
  };
  mapApiError: (error: unknown) => unknown;
  getErrorMessage: (error: unknown) => string;
}) {
  const { deps, ui, state, elements, mapApiError, getErrorMessage } = options;
  let busy = false;

  function savedMessage(message: string): void {
    if (elements.savedMessage) elements.savedMessage.textContent = message;
    ui.showState('saved');
  }

  function savedFailure(id: string, error: unknown): void {
    savedMessage(
      `Lead ${id} is saved. ${getErrorMessage(mapApiError(error))} The request outcome may be uncertain or stale; open the saved lead to review before retrying. No automatic AI retry.`
    );
  }

  async function convert(lead: SavedLead): Promise<void> {
    if (
      !lead.converted_to_application_id &&
      (lead.status === 'processing' ||
        !lead.title?.trim() ||
        !lead.company?.trim())
    ) {
      savedMessage(describeSavedLead(lead));
      return;
    }
    ui.showState('saving');
    const result = await deps.convertLeadToApplication(lead.id);
    state.existingApplication = result;
    // Keep the originating lead identity as well as the application identity.
    state.currentJobInfo = {
      title: result.job_title,
      company: result.company,
      location: result.location || null,
    };
    ui.updateJobInfoDisplay(state.currentJobInfo, 'savedJob');
    elements.convertBtn?.classList.add('hidden');
    if (elements.viewBtn) {
      elements.viewBtn.textContent = 'View in App';
      elements.viewBtn.dataset.applicationId = result.id;
    }
    savedMessage('Added as Application');
    ui.showNotification('Converted!', 'Job lead converted to application.');
  }

  async function saveAsApplication(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const saved = await deps.saveJobLead();
      // Duplicate actions must not enrich/overwrite an existing posting implicitly.
      if (!saved || !saved.created) return;
      const { lead } = saved;
      if (lead.revision === undefined) {
        savedMessage(describeSavedLead(lead));
        return;
      }
      try {
        savedMessage(
          `Lead ${lead.id} is saved. AI extraction requested; waiting for this request. Closing the popup may leave an uncertain outcome. Open in app to review.`
        );
        const extracted = await deps.extractJobLead(lead.id, lead.revision);
        state.existingLead = extracted;
        await convert(extracted);
      } catch (error) {
        savedFailure(lead.id, error);
      }
    } finally {
      busy = false;
    }
  }

  async function handleConvertToApplication(): Promise<void> {
    if (busy) return;
    const lead = state.existingLead;
    if (!lead) {
      ui.showErrorNotification('No lead to convert');
      return;
    }
    busy = true;
    ui.showState('saving');
    try {
      // Refresh manual completeness, processing and conversion state before acting.
      const current = await deps.getJobLead(lead.id);
      state.existingLead = current;
      await convert(current);
    } catch (error) {
      savedFailure(lead.id, error);
    } finally {
      busy = false;
    }
  }

  return { saveAsApplication, handleConvertToApplication };
}
