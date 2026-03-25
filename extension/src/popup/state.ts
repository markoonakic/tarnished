import type { FormDetectionState } from './detection';
import type { JobInfo, PopupState } from './view';

type TabStatus = {
  isJobPage: boolean;
  score: number;
  signals: string[];
  url: string;
};

type LeadLike = {
  id: string;
  title: string | null;
  company: string | null;
  location?: string | null;
} | null;

type ApplicationLike = {
  id: string;
  job_title: string;
  company: string;
  location?: string | null;
} | null;

export function createPopupStateController(options: {
  deps: {
    getSettings: () => Promise<{ appUrl: string; apiKey: string }>;
    queryTabs: () => Promise<Array<{ id?: number; url?: string }>>;
    getTabStatus: (tabId: number) => Promise<TabStatus | null>;
    getDetection: (
      tabId: number
    ) => Promise<{ isJobPage?: boolean; score?: number; signals?: string[] } | null>;
    getFormDetection: (tabId: number | null) => Promise<FormDetectionState | null>;
    checkExistingLead: (url: string) => Promise<LeadLike>;
    checkExistingApplication: (url: string) => Promise<ApplicationLike>;
    isRestrictedUrl: (url: string) => boolean;
    extractTitle: () => string | null;
    extractCompany: () => string | null;
    extractLocation: () => string | null;
  };
  ui: {
    showState: (state: PopupState) => void;
    showError: (message: string, recoverable?: boolean) => void;
    updateJobInfoDisplay: (info: JobInfo, prefix: 'job' | 'savedJob') => void;
    setFormDetectionState: (state: FormDetectionState) => void;
  };
  state: {
    currentTabId: number | null;
    currentTabUrl: string | null;
    currentJobInfo: JobInfo;
    existingLead: LeadLike;
    existingApplication: ApplicationLike;
  };
  elements: {
    savedMessage: { textContent: string | null } | null;
    convertBtn: {
      classList: { add: (token: string) => void; remove: (token: string) => void };
    } | null;
  };
  warn: (context: string, ...args: unknown[]) => void;
  getErrorMessage: (error: unknown) => string;
  isRecoverable: (error: unknown) => boolean;
}) {
  const { deps, ui, state, elements, warn, getErrorMessage, isRecoverable } = options;

  async function determineState(): Promise<void> {
    ui.showState('loading');

    try {
      const settings = await deps.getSettings();
      if (!settings.appUrl || !settings.apiKey) {
        ui.showState('no-settings');
        return;
      }

      const tabs = await deps.queryTabs();
      const currentTab = tabs[0];
      if (!currentTab?.id || !currentTab.url) {
        ui.showError('No active tab found');
        return;
      }

      state.currentTabId = currentTab.id;
      state.currentTabUrl = currentTab.url;

      if (deps.isRestrictedUrl(currentTab.url)) {
        ui.showError('Cannot access this page (restricted URL)');
        return;
      }

      let tabStatus: TabStatus | null = null;
      try {
        tabStatus = await deps.getTabStatus(currentTab.id);
      } catch (error) {
        warn('Popup', 'Failed to get tab status from background:', error);
      }

      if (!tabStatus) {
        try {
          const detectionResult = await deps.getDetection(currentTab.id);
          if (detectionResult) {
            tabStatus = {
              isJobPage: detectionResult.isJobPage ?? false,
              score: detectionResult.score ?? 0,
              signals: detectionResult.signals ?? [],
              url: currentTab.url,
            };
          }
        } catch (error) {
          warn('Popup', 'Failed to get detection from content script:', error);
        }
      }

      const formDetection = await deps.getFormDetection(currentTab.id);
      if (formDetection) {
        ui.setFormDetectionState(formDetection);
      }

      const [lead, application] = await Promise.all([
        deps.checkExistingLead(currentTab.url).catch((e) => {
          warn('Popup', 'Failed to check existing lead:', e);
          return null;
        }),
        deps.checkExistingApplication(currentTab.url).catch((e) => {
          warn('Popup', 'Failed to check existing application:', e);
          return null;
        }),
      ]);

      state.existingLead = lead;
      state.existingApplication = application;

      if (application) {
        state.currentJobInfo = {
          title: application.job_title,
          company: application.company,
          location: application.location || null,
        };
        if (elements.savedMessage) {
          elements.savedMessage.textContent = 'Added as Application';
        }
        elements.convertBtn?.classList.add('hidden');
        ui.updateJobInfoDisplay(state.currentJobInfo, 'savedJob');
        ui.showState('saved');
      } else if (lead) {
        state.currentJobInfo = {
          title: lead.title,
          company: lead.company,
          location: lead.location || null,
        };
        if (elements.savedMessage) {
          elements.savedMessage.textContent = 'Saved to Job Leads';
        }
        elements.convertBtn?.classList.remove('hidden');
        ui.updateJobInfoDisplay(state.currentJobInfo, 'savedJob');
        ui.showState('saved');
      } else if (tabStatus?.isJobPage) {
        state.currentJobInfo = {
          title: deps.extractTitle(),
          company: deps.extractCompany(),
          location: deps.extractLocation(),
        };
        elements.convertBtn?.classList.add('hidden');
        ui.updateJobInfoDisplay(state.currentJobInfo, 'job');
        ui.showState('detected');
      } else {
        ui.showState('not-detected');
      }
    } catch (error) {
      ui.showError(getErrorMessage(error), isRecoverable(error));
    }
  }

  return { determineState };
}
