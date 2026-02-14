/**
 * Job detection algorithm for identifying job posting pages
 * Uses multiple signals with weighted scoring to determine if a page is a job posting
 */

export interface DetectionResult {
  isJobPage: boolean;
  score: number;
  signals: string[];
}

/**
 * Known job board domains and platforms
 */
const JOB_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'workday',
  'myworkdayjobs.com',
  'linkedin.com/jobs',
  'indeed.com',
  'glassdoor.com',
];

/**
 * Keywords to look for in job-related headings
 */
const JOB_HEADING_KEYWORDS = [
  'requirements',
  'responsibilities',
  'qualifications',
  'benefits',
];

/**
 * Detects if the current page is a job posting using multiple signals
 *
 * Signal weights:
 * - JSON-LD JobPosting schema: 50
 * - Known job domain: 30
 * - Job-related headings: 10 each (max 20)
 * - Apply button: 10
 *
 * @returns DetectionResult with isJobPage (true if score >= 30), score, and detected signals
 */
export function detectJobPage(): DetectionResult {
  let score = 0;
  const signals: string[] = [];

  // Signal 1: JSON-LD JobPosting schema (weight: 50)
  const jsonLd = document.querySelector('script[type="application/ld+json"]');
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd.textContent || '{}');
      if (data['@type'] === 'JobPosting') {
        score += 50;
        signals.push('JSON-LD JobPosting');
      }
    } catch {
      // Invalid JSON, skip this signal
    }
  }

  // Signal 2: Known job domains (weight: 30)
  if (JOB_DOMAINS.some((domain) => location.href.includes(domain))) {
    score += 30;
    signals.push('Known job domain');
  }

  // Signal 3: Job-related headings (weight: 10 each, max 20)
  const headings = document.querySelectorAll('h1, h2, h3');
  let headingMatches = 0;
  headings.forEach((h) => {
    const text = h.textContent?.toLowerCase() || '';
    if (JOB_HEADING_KEYWORDS.some((keyword) => text.includes(keyword))) {
      headingMatches++;
    }
  });
  if (headingMatches > 0) {
    const headingScore = Math.min(headingMatches, 2) * 10;
    score += headingScore;
    signals.push(`Job headings (${headingMatches})`);
  }

  // Signal 4: Apply button (weight: 10)
  const buttons = document.querySelectorAll('button, a');
  const hasApplyButton = Array.from(buttons).some((btn) =>
    /apply/i.test(btn.textContent || '')
  );
  if (hasApplyButton) {
    score += 10;
    signals.push('Apply button');
  }

  return {
    isJobPage: score >= 30,
    score,
    signals,
  };
}

/**
 * Wraps job detection in a timeout to prevent hanging
 *
 * @param timeoutMs - Maximum time to wait for detection (default: 5000ms)
 * @returns Promise resolving to DetectionResult or rejecting on timeout
 */
export async function detectJobPageWithTimeout(
  timeoutMs = 5000
): Promise<DetectionResult> {
  return Promise.race([
    Promise.resolve(detectJobPage()),
    new Promise<DetectionResult>((_, reject) =>
      setTimeout(() => reject(new Error('Detection timeout')), timeoutMs)
    ),
  ]);
}
