import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPopupAutofillController } from './autofill';

describe('popup autofill controller', () => {
  const getProfile = vi.fn();
  const sendAutofillMessage = vi.fn();
  const hasAutofillData = vi.fn();
  const showNotification = vi.fn();
  const showErrorNotification = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createSubject(tabId: number | null = 123) {
    return createPopupAutofillController({
      deps: {
        getProfile,
        sendAutofillMessage,
        hasAutofillData,
      },
      state: { currentTabId: tabId },
      ui: {
        showNotification,
        showErrorNotification,
      },
      mapApiError: (error) => error,
      getErrorMessage: (error) => String(error),
    });
  }

  it('shows setup guidance when profile has no autofill data', async () => {
    getProfile.mockResolvedValue({
      first_name: null,
      last_name: null,
      email: null,
      phone: null,
      city: null,
      country: null,
      linkedin_url: null,
    });
    hasAutofillData.mockReturnValue(false);

    await createSubject().autofillFormHandler();

    expect(showErrorNotification).toHaveBeenCalledWith(
      'Set up your profile in the app to enable autofill'
    );
    expect(sendAutofillMessage).not.toHaveBeenCalled();
  });

  it('shows filled count when autofill succeeds', async () => {
    getProfile.mockResolvedValue({
      first_name: 'A',
      last_name: 'B',
      email: 'a@example.com',
      phone: null,
      city: null,
      country: null,
      linkedin_url: null,
    });
    hasAutofillData.mockReturnValue(true);
    sendAutofillMessage.mockResolvedValue({ filledCount: 2 });

    await createSubject().autofillFormHandler();

    expect(sendAutofillMessage).toHaveBeenCalledWith(123, expect.any(Object));
    expect(showNotification).toHaveBeenCalledWith(
      'Autofill Complete',
      'Filled 2 fields.'
    );
  });

  it('shows an active tab error when no tab is available', async () => {
    await createSubject(null).autofillFormHandler();

    expect(showErrorNotification).toHaveBeenCalledWith('No active tab');
  });
});
