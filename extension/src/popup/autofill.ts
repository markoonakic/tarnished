import type { AutofillProfile } from '../lib/autofill';

type AutofillDeps = {
  getProfile: () => Promise<AutofillProfile>;
  sendAutofillMessage: (
    tabId: number,
    profile: AutofillProfile
  ) => Promise<{ filledCount?: number }>;
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
          ui.showNotification(
            'Autofill Complete',
            `Filled ${response.filledCount} field${response.filledCount !== 1 ? 's' : ''}.`
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
