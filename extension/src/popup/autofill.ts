import type { AutofillProfile } from '../lib/autofill';

type AutofillDeps = {
  getProfile: () => Promise<AutofillProfile>;
  sendAutofillMessage: (
    tabId: number,
    profile: AutofillProfile
  ) => Promise<{ filledCount?: number; framesContacted?: number }>;
  hasAutofillData: (profile: AutofillProfile) => boolean;
};

type AutofillUi = {
  showNotification: (title: string, message: string) => void;
  showErrorNotification: (message: string) => void;
};

export function createPopupAutofillController(options: {
  deps: AutofillDeps;
  state: { currentTabId: number | null };
  ui: AutofillUi;
  mapApiError: (error: unknown) => unknown;
  getErrorMessage: (error: unknown) => string;
}) {
  const { deps, state, ui, mapApiError, getErrorMessage } = options;

  async function autofillFormHandler(): Promise<void> {
    if (!state.currentTabId) {
      ui.showErrorNotification('No active tab');
      return;
    }

    try {
      const profile = await deps.getProfile();

      if (!deps.hasAutofillData(profile)) {
        ui.showErrorNotification(
          'Set up your profile in the app to enable autofill'
        );
        return;
      }

      const response = await deps.sendAutofillMessage(
        state.currentTabId,
        profile
      );

      if (typeof response?.filledCount === 'number') {
        if (response.filledCount > 0) {
          // Frame results arrive asynchronously, so when frames were contacted
          // the message must not imply the whole page was filled.
          const frames = response.framesContacted ?? 0;
          const suffix =
            frames > 0
              ? ` Embedded frames were also contacted (${frames}); check them for partial fills.`
              : '';
          ui.showNotification(
            'Autofill Complete',
            `Filled ${response.filledCount} field${response.filledCount !== 1 ? 's' : ''} in this page.${suffix}`
          );
        } else if ((response.framesContacted ?? 0) > 0) {
          // Nothing was filled here but frames were contacted; reporting "no empty
          // fields found" would overstate certainty about those frames.
          ui.showNotification(
            'Autofill Sent',
            `No empty fields on this page. Sent autofill to ${response.framesContacted} embedded frame${response.framesContacted !== 1 ? 's' : ''}; check them for partial fills.`
          );
        } else {
          ui.showNotification(
            'No Fields Found',
            'No empty form fields found to fill.'
          );
        }
      } else {
        ui.showNotification(
          'Autofill Failed',
          'Could not complete autofill. Try refreshing the page.'
        );
      }
    } catch (error) {
      const extensionError = mapApiError(error);
      ui.showErrorNotification(getErrorMessage(extensionError));
    }
  }

  return {
    autofillFormHandler,
  };
}
