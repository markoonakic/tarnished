import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractCompanyFromDocument,
  extractLocationFromDocument,
  extractTitleFromDocument,
  getFormDetectionFromContentScript,
  getTextFromContentScript,
  isRestrictedUrl,
} from './detection';

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage,
    },
  },
}));

describe('popup detection helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('extracts page info from common selectors', () => {
    document.body.innerHTML = `
      <h1 class="job-title">Senior Engineer</h1>
      <div class="company-name">Acme Corp</div>
      <div class="job-location">Remote</div>
    `;

    expect(extractTitleFromDocument(document)).toBe('Senior Engineer');
    expect(extractCompanyFromDocument(document)).toBe('Acme Corp');
    expect(extractLocationFromDocument(document)).toBe('Remote');
  });

  it('detects restricted urls', () => {
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedUrl('https://example.com/jobs/1')).toBe(false);
  });

  it('gets text and form detection from content script', async () => {
    sendMessage
      .mockResolvedValueOnce({ text: 'job posting text' })
      .mockResolvedValueOnce({ hasApplicationForm: true, fillableFieldCount: 4 });

    await expect(getTextFromContentScript(123)).resolves.toBe('job posting text');
    await expect(getFormDetectionFromContentScript(123)).resolves.toEqual({
      hasApplicationForm: true,
      fillableFieldCount: 4,
    });
  });
});
