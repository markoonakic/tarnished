type JobInfo = {
  title: string | null;
  company: string | null;
  location: string | null;
};

type LeadLike = {
  id: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
} | null;
type ApplicationLike = {
  id: string;
  job_title: string;
  company: string;
  location?: string | null;
} | null;

type ActionDeps = {
  getStatuses: () => Promise<Array<{ id: string; name: string }>>;
  extractApplication: (input: {
    url: string;
    status_id: string;
    applied_at: string;
    text?: string;
  }) => Promise<{ id: string; job_title: string; company: string }>;
  convertLeadToApplication: (leadId: string) => Promise<{
    id: string;
    job_title: string;
    company: string;
    location?: string | null;
  }>;
  getCurrentTabText: () => Promise<string>;
};

type ActionUi = {
  showState: (state: 'saving' | 'saved') => void;
  showError: (message: string, recoverable?: boolean) => void;
  showErrorNotification: (message: string) => void;
  showApplicationSuccessNotification: (
    title: string | null,
    company: string | null
  ) => void;
  showNotification: (title: string, message: string) => void;
  updateJobInfoDisplay: (info: JobInfo, prefix: 'savedJob') => void;
};

type ActionState = {
  currentTabUrl: string | null;
  currentJobInfo: JobInfo;
  existingLead: LeadLike;
  existingApplication: ApplicationLike;
  appliedStatusId: string | null;
};

type ActionElements = {
  savedMessage: { textContent: string | null } | null;
  viewBtn: { textContent: string; dataset: Record<string, string> } | null;
  convertBtn: { classList: { add: (token: string) => void } } | null;
};

export function createPopupActions(options: {
  deps: ActionDeps;
  ui: ActionUi;
  state: ActionState;
  elements: ActionElements;
  debug: (context: string, ...args: unknown[]) => void;
  warn: (context: string, ...args: unknown[]) => void;
  mapApiError: (error: unknown) => unknown;
  getErrorMessage: (error: unknown) => string;
  isRecoverable: (error: unknown) => boolean;
}) {
  const {
    deps,
    ui,
    state,
    elements,
    debug,
    warn,
    mapApiError,
    getErrorMessage,
    isRecoverable,
  } = options;

  async function getAppliedStatusId(): Promise<string | null> {
    if (state.appliedStatusId) {
      return state.appliedStatusId;
    }

    try {
      const statuses = await deps.getStatuses();
      const appliedStatus = statuses.find(
        (s) => s.name.toLowerCase() === 'applied'
      );
      if (appliedStatus) {
        state.appliedStatusId = appliedStatus.id;
      }
      return state.appliedStatusId;
    } catch (error) {
      warn('Popup', 'Failed to get statuses:', error);
      return null;
    }
  }

  async function saveAsApplication(): Promise<void> {
    if (!state.currentTabUrl) {
      const errorMsg = 'No URL to save';
      ui.showError(errorMsg);
      ui.showErrorNotification(errorMsg);
      return;
    }

    ui.showState('saving');

    try {
      const statusId = await getAppliedStatusId();
      if (!statusId) {
        const errorMsg =
          'Could not find "Applied" status. Please ensure it exists in your application settings.';
        ui.showError(errorMsg, true);
        ui.showErrorNotification(errorMsg);
        return;
      }

      let text: string | undefined;
      try {
        text = await deps.getCurrentTabText();
        debug(
          'Popup',
          'Got text from content script:',
          text?.substring(0, 100)
        );
      } catch (e) {
        warn('Popup', 'Failed to get text from content script:', e);
      }

      debug(
        'Popup',
        'Calling extractApplication with text:',
        !!text,
        'length:',
        text?.length
      );

      const result = await deps.extractApplication({
        url: state.currentTabUrl,
        status_id: statusId,
        applied_at: new Date().toISOString().split('T')[0],
        text,
      });

      ui.showApplicationSuccessNotification(result.job_title, result.company);
      if (elements.savedMessage) {
        elements.savedMessage.textContent = 'Added as Application';
      }
      state.currentJobInfo = {
        title: result.job_title,
        company: result.company,
        location: null,
      };
      ui.updateJobInfoDisplay(state.currentJobInfo, 'savedJob');
      if (elements.viewBtn) {
        elements.viewBtn.textContent = 'View in App';
        elements.viewBtn.dataset.applicationId = result.id;
      }
      ui.showState('saved');
    } catch (error) {
      const extensionError = mapApiError(error);
      const message = getErrorMessage(extensionError);
      ui.showError(message, isRecoverable(extensionError));
      ui.showErrorNotification(message);
    }
  }

  async function handleConvertToApplication(): Promise<void> {
    if (!state.existingLead) {
      ui.showErrorNotification('No lead to convert');
      return;
    }

    ui.showState('saving');

    try {
      const result = await deps.convertLeadToApplication(state.existingLead.id);
      state.existingApplication = result;
      state.existingLead = null;
      state.currentJobInfo = {
        title: result.job_title,
        company: result.company,
        location: result.location || null,
      };

      if (elements.savedMessage) {
        elements.savedMessage.textContent = 'Added as Application';
      }
      ui.updateJobInfoDisplay(state.currentJobInfo, 'savedJob');
      elements.convertBtn?.classList.add('hidden');
      if (elements.viewBtn) {
        elements.viewBtn.dataset.applicationId = result.id;
      }
      ui.showState('saved');
      ui.showNotification('Converted!', 'Job lead converted to application.');
    } catch (error) {
      const extensionError = mapApiError(error);
      const message = getErrorMessage(extensionError);
      ui.showError(message, isRecoverable(extensionError));
      ui.showErrorNotification(message);
      ui.showState('saved');
    }
  }

  return {
    getAppliedStatusId,
    saveAsApplication,
    handleConvertToApplication,
  };
}
