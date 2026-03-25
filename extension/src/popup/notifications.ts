type BrowserNotificationsApi = {
  create: (options: {
    type: 'basic';
    iconUrl: string;
    title: string;
    message: string;
  }) => Promise<string>;
};

export function createBrowserNotifier(
  notifications: BrowserNotificationsApi
): (title: string, message: string) => Promise<void> {
  return async (title: string, message: string) => {
    await notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon48.png',
      title,
      message,
    });
  };
}

export function createPopupNotifications(options: {
  notify: (title: string, message: string) => Promise<void>;
  warn: (context: string, ...args: unknown[]) => void;
}) {
  const { notify, warn } = options;

  async function showNotification(title: string, message: string): Promise<void> {
    try {
      await notify(title, message);
    } catch (error) {
      warn('Popup', 'Failed to show notification:', error);
    }
  }

  async function showSuccessNotification(
    title: string | null,
    company: string | null
  ): Promise<void> {
    const jobTitle = title || 'Job Lead';
    const companyText = company ? ` at ${company}` : '';
    await showNotification(
      'Job Saved!',
      `${jobTitle}${companyText} has been saved to Job Leads.`
    );
  }

  async function showApplicationSuccessNotification(
    title: string | null,
    company: string | null
  ): Promise<void> {
    const jobTitle = title || 'Application';
    const companyText = company ? ` at ${company}` : '';
    await showNotification(
      'Application Added!',
      `${jobTitle}${companyText} has been added as an application.`
    );
  }

  async function showErrorNotification(message: string): Promise<void> {
    await showNotification('Error', message);
  }

  return {
    showNotification,
    showSuccessNotification,
    showApplicationSuccessNotification,
    showErrorNotification,
  };
}
