import { describe, expect, it, vi } from 'vitest';

import { createBrowserNotifier, createPopupNotifications } from './notifications';

describe('popup notifications', () => {
  it('formats a saved job lead notification with fallback title', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const subject = createPopupNotifications({
      notify,
      warn: vi.fn(),
    });

    await subject.showSuccessNotification(null, 'Acme');

    expect(notify).toHaveBeenCalledWith(
      'Job Saved!',
      'Job Lead at Acme has been saved to Job Leads.'
    );
  });

  it('surfaces notification failures through the shared logger', async () => {
    const warn = vi.fn();
    const failure = new Error('no notification permission');
    const subject = createPopupNotifications({
      notify: vi.fn().mockRejectedValue(failure),
      warn,
    });

    await subject.showErrorNotification('No active tab');

    expect(warn).toHaveBeenCalledWith(
      'Popup',
      'Failed to show notification:',
      failure
    );
  });

  it('adapts the browser notification api to the popup notifier contract', async () => {
    const create = vi.fn().mockResolvedValue('notification-id');
    const notify = createBrowserNotifier({ create });

    await notify('Saved', 'Lead saved');

    expect(create).toHaveBeenCalledWith({
      type: 'basic',
      iconUrl: '/icons/icon48.png',
      title: 'Saved',
      message: 'Lead saved',
    });
  });
});
