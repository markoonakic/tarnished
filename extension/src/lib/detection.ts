export interface DetectionResult {
  isJobPage: boolean;
  score: number;
  signals: string[];
}

const JOB_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'myworkdayjobs.com',
  'workday.com',
  'smartrecruiters.com',
  'jobvite.com',
  'brassring.com',
  'icims.com',
  'taleo.net',
  'jobs.ashbyhq.com',
  'jobs.rippling.com',
  'linkedin.com/jobs',
  'indeed.com',
  'glassdoor.com',
  'monster.com',
  'ziprecruiter.com',
  'careerbuilder.com',
  'simplyhired.com',
  'wellfound.com',
  'angel.co',
  'jobs.apple.com',
  'careers.microsoft.com',
  'amazon.jobs',
  'careers.google.com',
  'meta.careers',
  'jobs.netflix.com',
  'stripe.com/jobs',
];

const JOB_HEADING_KEYWORDS = [
  'requirements',
  'responsibilities',
  'qualifications',
  'benefits',
  'perks',
  'what you',
  "you'll",
  'ideal candidate',
  'who we are',
  'about the role',
  'about us',
  'job description',
  'the role',
  'what we offer',
  'compensation',
  'we are looking for',
  'minimum',
  'preferred',
  'experience required',
  'skills',
];

const APPLY_BUTTON_PATTERNS = [
  /^apply\s*$/i,
  /apply\s*(now|today|here)/i,
  /submit\s*(application|resume)/i,
];

function hasJobPosting(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(hasJobPosting);
  if (!data || typeof data !== 'object') return false;
  const node = data as Record<string, unknown>;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return (
    types.some(
      (type) =>
        typeof type === 'string' &&
        [
          'JobPosting',
          'https://schema.org/JobPosting',
          'http://schema.org/JobPosting',
        ].includes(type)
    ) ||
    (Array.isArray(node['@graph']) && node['@graph'].some(hasJobPosting))
  );
}

export function detectJobPage(): DetectionResult {
  let score = 0;
  const signals: string[] = [];

  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]'
  )) {
    try {
      if (hasJobPosting(JSON.parse(script.textContent || '{}'))) {
        score += 50;
        signals.push('JSON-LD JobPosting');
        break;
      }
    } catch {
      // A malformed block does not prevent checking other structured data.
    }
  }

  const matchedDomain = JOB_DOMAINS.find((domain) => {
    const [host, path] = domain.split('/');
    return (
      (location.hostname === host || location.hostname.endsWith(`.${host}`)) &&
      (!path ||
        location.pathname === `/${path}` ||
        location.pathname.startsWith(`/${path}/`))
    );
  });
  if (matchedDomain) {
    score += 30;
    signals.push(`Job domain: ${matchedDomain}`);
  }

  const matchedHeadings = new Set<string>();
  for (const heading of document.querySelectorAll('h1, h2, h3')) {
    const text = heading.textContent?.toLowerCase() || '';
    const keyword = JOB_HEADING_KEYWORDS.find((keyword) =>
      text.includes(keyword)
    );
    if (keyword) matchedHeadings.add(keyword);
  }
  if (matchedHeadings.size) {
    score += Math.min(matchedHeadings.size, 2) * 10;
    signals.push(
      `Job headings: ${[...matchedHeadings].slice(0, 2).join(', ')}`
    );
  }

  if (
    [...document.querySelectorAll('button, a, [role="button"]')].some(
      (button) =>
        APPLY_BUTTON_PATTERNS.some((pattern) =>
          pattern.test(button.textContent?.trim() || '')
        )
    )
  ) {
    score += 10;
    signals.push('Apply button');
  }

  return { isJobPage: score >= 30, score, signals };
}
