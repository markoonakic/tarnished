type JobInfo = {
  title: string | null;
  company: string | null;
  location: string | null;
};

type LeadResponse = {
  id: string;
  title: string | null;
  company: string | null;
  location?: string | null;
};

export function createPopupSaveLeadController(options: {
  deps: {
    getCurrentTabText: () => Promise<string>;
    saveJobLead: (url: string, text: string) => Promise<LeadResponse>;
    setJobStatus: (
      url: string,
      status: {
        url: string;
        isJobPage: boolean;
        existingLeadId: string;
        title: string | null;
        company: string | null;
      }
    ) => Promise<void>;
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
    existingLead: LeadResponse | null;
  };
  elements: {
    savedMessage: { textContent: string | null } | null;
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

  async function saveJobLead(): Promise<void> {
    if (!state.currentTabUrl) {
      const errorMsg = 'No URL to save';
      ui.showError(errorMsg);
      ui.showErrorNotification(errorMsg);
      return;
    }

    ui.showState('saving');

    try {
      const text = await deps.getCurrentTabText();
      const result = await deps.saveJobLead(state.currentTabUrl, text);

      state.existingLead = result;
      state.currentJobInfo = {
        title: result.title,
        company: result.company,
        location: result.location || null,
      };

      await deps.setJobStatus(state.currentTabUrl, {
        url: state.currentTabUrl,
        isJobPage: true,
        existingLeadId: result.id,
        title: result.title,
        company: result.company,
      });

      ui.showSuccessNotification(result.title, result.company);
      if (elements.savedMessage) {
        elements.savedMessage.textContent = 'Saved to Job Leads';
      }
      ui.updateJobInfoDisplay(state.currentJobInfo, 'savedJob');
      ui.showState('saved');
    } catch (error) {
      const extensionError = mapApiError(error);
      const message = getErrorMessage(extensionError);
      ui.showError(message, isRecoverable(extensionError));
      ui.showErrorNotification(message);
    }
  }

  return { saveJobLead };
}
