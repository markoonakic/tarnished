import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectJobPage } from './detection';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('location', new URL('https://company.invalid/job'));
});
afterEach(() => vi.unstubAllGlobals());

function addStructuredData(data: unknown) {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.body.appendChild(script);
}

describe('job detection', () => {
  it('checks all JSON-LD blocks after malformed or unrelated data', () => {
    document.body.innerHTML =
      '<script type="application/ld+json">invalid</script>';
    addStructuredData({ '@type': 'WebSite' });
    addStructuredData({ '@type': 'JobPosting' });
    addStructuredData({ '@type': 'JobPosting' });
    expect(detectJobPage()).toEqual({
      isJobPage: true,
      score: 50,
      signals: ['JSON-LD JobPosting'],
    });
  });

  it.each([
    [{ '@type': 'JobPosting' }],
    { '@graph': [{ '@type': ['Thing', 'JobPosting'] }] },
    { '@type': 'https://schema.org/JobPosting' },
  ])('recognizes JSON-LD arrays and graph nodes: %j', (data) => {
    addStructuredData(data);
    expect(detectJobPage().isJobPage).toBe(true);
  });

  it.each([
    'https://company.invalid/?next=indeed.com',
    'https://notindeed.com/role',
    'https://linkedin.com/not-jobs',
    'https://company.invalid/workday',
  ])('does not match a job domain in unrelated URL %s', (url) => {
    vi.stubGlobal('location', new URL(url));
    expect(detectJobPage().score).toBe(0);
  });

  it.each([
    'https://jobs.lever.co/acme',
    'https://www.linkedin.com/jobs/view/1',
    'https://acme.myworkdayjobs.com/job',
  ])('matches known hosts and job paths: %s', (url) => {
    vi.stubGlobal('location', new URL(url));
    expect(detectJobPage().score).toBe(30);
  });

  it('caps heading points at 20 and combines them with an apply button', () => {
    document.body.innerHTML =
      '<h1>Requirements</h1><h2>Benefits</h2><h3>Responsibilities</h3><button>Apply now</button>';
    expect(detectJobPage().score).toBe(30);
    expect(detectJobPage().isJobPage).toBe(true);
  });
});
