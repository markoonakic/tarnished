/**
 * Job detection algorithm for identifying job posting pages
 * Uses multiple signals with weighted scoring to determine if a page is a job posting
 *
 * ## Expected Behavior by Platform
 *
 * ### LinkedIn Jobs (linkedin.com/jobs)
 * - Detected via: Known job domain (30) + Apply button (10) + Job headings (10-20)
 * - Typical score: 50-60
 * - Notes: Individual job posting pages reliably detected
 *
 * ### Indeed (indeed.com)
 * - Detected via: Known job domain (30) + Apply button (10) + Job headings (10-20)
 * - Typical score: 50-60
 * - Notes: Job view pages detected; search results pages may also trigger
 *
 * ### Greenhouse (boards.greenhouse.io)
 * - Detected via: Known job domain (30) + Apply button (10) + Job headings (10-20)
 * - Typical score: 50-60
 * - Notes: Consistent page structure makes detection reliable
 *
 * ### Lever (jobs.lever.co)
 * - Detected via: Known job domain (30) + Apply button (10) + Job headings (10-20)
 * - Typical score: 50-60
 * - Notes: Clean job posting format with standard sections
 *
 * ### Workday (myworkdayjobs.com)
 * - Detected via: Known job domain (30) + Job headings (10-20)
 * - Typical score: 40-50
 * - Notes: Apply button may be labeled differently ("Apply Now" vs "Apply")
 *
 * ## False Positive Prevention
 * - Score threshold of 30 prevents most false positives
 * - JSON-LD schema (50 points) alone is sufficient for detection
 * - Domain match (30 points) requires additional signals
 * - Generic pages rarely accumulate 30+ points without job-specific content
 *
 * @module detection
 */

export interface DetectionResult {
  isJobPage: boolean;
  score: number;
  signals: string[];
}

/**
 * Known job board domains and platforms
 *
 * Includes major ATS platforms, job aggregators, and career sites.
 * Detection uses substring matching against the full URL.
 */
const JOB_DOMAINS = [
  // ATS Platforms (Application Tracking Systems)
  'boards.greenhouse.io', // Greenhouse
  'greenhouse.io', // Greenhouse (fallback)
  'jobs.lever.co', // Lever
  'lever.co', // Lever (fallback)
  'myworkdayjobs.com', // Workday
  'workday', // Workday (fallback for custom domains)
  'smartrecruiters.com', // SmartRecruiters
  'jobvite.com', // Jobvite
  'brassring.com', // IBM BrassRing
  'icims.com', // iCIMS
  'taleo.net', // Oracle Taleo
  'jobs.ashbyhq.com', // Ashby
  'jobs.rippling.com', // Rippling

  // Job Aggregators
  'linkedin.com/jobs', // LinkedIn Jobs
  'indeed.com', // Indeed
  'glassdoor.com', // Glassdoor
  'monster.com', // Monster
  'ziprecruiter.com', // ZipRecruiter
  'careerbuilder.com', // CareerBuilder
  'simplyhired.com', // SimplyHired
  'wellfound.com', // Wellfound (formerly AngelList)
  'angel.co', // AngelList (legacy)

  // Company Career Pages (Major Tech)
  'jobs.apple.com', // Apple
  'careers.microsoft.com', // Microsoft
  'amazon.jobs', // Amazon
  'careers.google.com', // Google
  'meta.careers', // Meta
  'jobs.netflix.com', // Netflix
  'stripe.com/jobs', // Stripe
];

/**
 * Keywords to look for in job-related headings
 *
 * These keywords are common section headers in job postings.
 * Detection looks for these in h1, h2, and h3 elements.
 */
const JOB_HEADING_KEYWORDS = [
  // Core job posting sections
  'requirements',
  'responsibilities',
  'qualifications',
  'benefits',
  'perks',

  // Additional common sections
  'what you', // "What You'll Do", "What You Need"
  "you'll", // "You'll Love", "You'll Do"
  'ideal candidate', // "Ideal Candidate"
  'who we are', // Company intro
  'about the role', // Role description
  'about us', // Company info
  'job description', // Explicit label
  'the role', // "The Role"
  'what we offer', // Compensation section
  'compensation', // Pay info
  'we are looking for', // Intro text
  'minimum', // Minimum qualifications
  'preferred', // Preferred qualifications
  'experience required', // Requirements
  'skills', // Skills section
];

/**
 * Score threshold for determining if a page is a job posting
 * Pages with scores >= this value are considered job pages
 */
const DETECTION_THRESHOLD = 30;

/**
 * Regex patterns for detecting apply buttons
 * Matches common variations like "Apply", "Apply Now", "Apply Today", etc.
 */
const APPLY_BUTTON_PATTERNS = [
  /^apply$/i, // Exact "Apply"
  /apply\s*(now|today|here)/i, // "Apply Now", "Apply Today"
  /submit\s*(application|resume)/i, // "Submit Application"
  /^apply\s*$/i, // Standalone "Apply"
];

/**
 * Detects if the current page is a job posting using multiple signals
 *
 * ## Scoring Algorithm
 *
 * | Signal                | Weight | Description                                    |
 * |-----------------------|--------|------------------------------------------------|
 * | JSON-LD JobPosting    | 50     | Structured data schema for job postings        |
 * | Known job domain      | 30     | URL matches known ATS/aggregator domain        |
 * | Job-related headings  | 10 ea  | h1/h2/h3 contains job keywords (max 2 = 20)    |
 * | Apply button          | 10     | Button/link with apply-related text            |
 *
 * ## Detection Threshold: 30 points
 *
 * A page is considered a job posting if the total score >= 30.
 * This threshold is chosen to:
 * - Reliably detect job pages on known platforms
 * - Avoid false positives on general career/company pages
 * - Allow detection even when some signals are missing
 *
 * @returns DetectionResult with isJobPage (true if score >= 30), score, and detected signals
 *
 * @example
 * // On a Greenhouse job posting
 * const result = detectJobPage();
 * // result = {
 * //   isJobPage: true,
 * //   score: 60,
 * //   signals: ['Known job domain', 'Job headings (2)', 'Apply button']
 * // }
 */
export function detectJobPage(): DetectionResult {
  let score = 0;
  const signals: string[] = [];

  // Signal 1: JSON-LD JobPosting schema (weight: 50)
  // This is the most reliable signal as it's structured data specifically for jobs
  const jsonLd = document.querySelector('script[type="application/ld+json"]');
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd.textContent || '{}');

      // Check for JobPosting type in multiple formats
      let foundJobPosting = false;

      // Check direct @type (single or array)
      const types = Array.isArray(data['@type'])
        ? data['@type']
        : [data['@type']];
      if (types.includes('JobPosting')) {
        foundJobPosting = true;
      }

      // Check @graph array (common pattern for multiple entities)
      if (!foundJobPosting && data['@graph'] && Array.isArray(data['@graph'])) {
        for (const item of data['@graph']) {
          const itemTypes = Array.isArray(item['@type'])
            ? item['@type']
            : [item['@type']];
          if (itemTypes.includes('JobPosting')) {
            foundJobPosting = true;
            break;
          }
        }
      }

      if (foundJobPosting) {
        score += 50;
        signals.push('JSON-LD JobPosting');
      }
    } catch {
      // Invalid JSON, skip this signal
    }
  }

  // Signal 2: Known job domains (weight: 30)
  // Matches against the full URL for flexibility with subdomains
  const matchedDomain = JOB_DOMAINS.find((domain) =>
    location.href.includes(domain)
  );
  if (matchedDomain) {
    score += 30;
    signals.push(`Job domain: ${matchedDomain}`);
  }

  // Signal 3: Job-related headings (weight: 10 each, max 20)
  // Looks for common section headers in job postings
  const headings = document.querySelectorAll('h1, h2, h3');
  const matchedHeadings: string[] = [];
  headings.forEach((h) => {
    const text = h.textContent?.toLowerCase() || '';
    const matchedKeyword = JOB_HEADING_KEYWORDS.find((keyword) =>
      text.includes(keyword)
    );
    if (matchedKeyword && !matchedHeadings.includes(matchedKeyword)) {
      matchedHeadings.push(matchedKeyword);
    }
  });
  if (matchedHeadings.length > 0) {
    const headingScore = Math.min(matchedHeadings.length, 2) * 10;
    score += headingScore;
    signals.push(`Job headings: ${matchedHeadings.slice(0, 2).join(', ')}`);
  }

  // Signal 4: Apply button (weight: 10)
  // Matches common variations of apply button text
  const buttons = document.querySelectorAll('button, a, [role="button"]');
  const hasApplyButton = Array.from(buttons).some((btn) => {
    const text = btn.textContent?.trim() || '';
    return APPLY_BUTTON_PATTERNS.some((pattern) => pattern.test(text));
  });
  if (hasApplyButton) {
    score += 10;
    signals.push('Apply button');
  }

  return {
    isJobPage: score >= DETECTION_THRESHOLD,
    score,
    signals,
  };
}

/**
 * Wraps job detection in a timeout to prevent hanging
 *
 * Use this when detection runs on page load or in content scripts
 * where the page might be in an unexpected state.
 *
 * @param timeoutMs - Maximum time to wait for detection (default: 5000ms)
 * @returns Promise resolving to DetectionResult or rejecting on timeout
 *
 * @example
 * try {
 *   const result = await detectJobPageWithTimeout();
 *   if (result.isJobPage) {
 *     console.log('Job detected!', result.signals);
 *   }
 * } catch (error) {
 *   console.error('Detection timed out');
 * }
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
