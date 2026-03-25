import browser from 'webextension-polyfill';

export interface FormDetectionState {
  hasApplicationForm: boolean;
  fillableFieldCount: number;
}

const TITLE_SELECTORS = [
  '[data-testid="job-title"]',
  '.job-title',
  '.jobTitle',
  'h1[data-job-id]',
  'h1.job-search-title',
  '.posting-headline h2',
  '.job-posting h1',
  'h1.title',
];

const COMPANY_SELECTORS = [
  '[data-testid="company-name"]',
  '.company-name',
  '.companyName',
  '.posting-headline .company',
  '.job-posting .company',
  '.company-link',
];

const LOCATION_SELECTORS = [
  '[data-testid="job-location"]',
  '.job-location',
  '.location',
  '.jobLocation',
  '.posting-headline .location',
];

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'edge://',
  'brave://',
  'opera://',
  'vivaldi://',
  'moz-extension://',
  'resource://',
];

function extractText(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element?.textContent) {
      return element.textContent.trim();
    }
  }

  return null;
}

export function extractTitleFromDocument(document: Document): string | null {
  return extractText(document, TITLE_SELECTORS);
}

export function extractCompanyFromDocument(document: Document): string | null {
  return extractText(document, COMPANY_SELECTORS);
}

export function extractLocationFromDocument(document: Document): string | null {
  return extractText(document, LOCATION_SELECTORS);
}

export function isRestrictedUrl(url: string): boolean {
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export async function getTextFromContentScript(tabId: number): Promise<string> {
  try {
    const response = (await browser.tabs.sendMessage(tabId, {
      type: 'GET_TEXT',
    })) as { text?: string };

    if (response?.text) {
      return response.text;
    }

    throw new Error('No text content received');
  } catch {
    throw new Error('Failed to get page content');
  }
}

export async function getFormDetectionFromContentScript(
  tabId: number | null
): Promise<FormDetectionState | null> {
  if (!tabId) {
    return null;
  }

  const response = (await browser.tabs.sendMessage(tabId, {
    type: 'SCAN_FIELDS',
  })) as { hasApplicationForm?: boolean; fillableFieldCount?: number };

  if (typeof response?.fillableFieldCount !== 'number') {
    return null;
  }

  return {
    hasApplicationForm: response.hasApplicationForm ?? false,
    fillableFieldCount: response.fillableFieldCount,
  };
}
