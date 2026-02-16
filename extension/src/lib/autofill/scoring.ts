/**
 * Heuristic scoring for field detection.
 *
 * Scores inputs based on multiple signals:
 * - autocomplete attribute (highest confidence)
 * - aria-label
 * - associated label text
 * - placeholder text
 * - name/id attributes (lowest - often obfuscated)
 */

import type { FieldType, FieldPattern, ScoredField } from './types';

/**
 * Score thresholds.
 */
export const SCORE_THRESHOLD = 30;

/**
 * Score weights for each signal type.
 */
export const SCORE_WEIGHTS = {
  autocomplete: 100,
  ariaLabel: 50,
  labelText: 60,
  placeholder: 40,
  name: 30,
  id: 20,
} as const;

/**
 * Field patterns for each supported field type.
 */
export const FIELD_PATTERNS: Record<FieldType, FieldPattern> = {
  first_name: {
    autocomplete: ['given-name', 'fname', 'firstname'],
    labelPatterns: [
      /\bfirst\s*name\b/i,
      /\bfname\b/i,
      /\bgiven\s*name\b/i,
      /^first$/i,
    ],
    placeholderPatterns: [
      /first\s*name/i,
      /e\.g\.\s*john/i,
      /^first$/i,
    ],
    namePatterns: [
      /first_?name/i,
      /fname/i,
      /given_?name/i,
    ],
    idPatterns: [
      /first_?name/i,
      /fname/i,
      /given_?name/i,
    ],
  },
  last_name: {
    autocomplete: ['family-name', 'lname', 'lastname', 'surname'],
    labelPatterns: [
      /\blast\s*name\b/i,
      /\blname\b/i,
      /\bsurname\b/i,
      /\bfamily\s*name\b/i,
      /^last$/i,
    ],
    placeholderPatterns: [
      /last\s*name/i,
      /surname/i,
      /e\.g\.\s*(doe|smith)/i,
      /^last$/i,
    ],
    namePatterns: [
      /last_?name/i,
      /lname/i,
      /surname/i,
      /family_?name/i,
    ],
    idPatterns: [
      /last_?name/i,
      /lname/i,
      /surname/i,
      /family_?name/i,
    ],
  },
  full_name: {
    autocomplete: ['name', 'full-name', 'fullname'],
    labelPatterns: [
      /\bfull\s*name\b/i,
      /\byour\s*name\b/i,
      /\bname\b/i,
      /\bapplicant\s*name\b/i,
      /\bcandidate\s*name\b/i,
    ],
    placeholderPatterns: [
      /full\s*name/i,
      /your\s*name/i,
      /e\.g\.\s*john\s*doe/i,
      /enter\s*your\s*name/i,
    ],
    namePatterns: [
      /full_?name/i,
      /applicant_?name/i,
      /candidate_?name/i,
      /user_?name/i,
      /^name$/i,
    ],
    idPatterns: [
      /full_?name/i,
      /applicant_?name/i,
      /candidate_?name/i,
      /user_?name/i,
    ],
  },
  email: {
    autocomplete: ['email', 'email-address'],
    labelPatterns: [
      /\bemail\b/i,
      /\be-?mail\s*address\b/i,
    ],
    placeholderPatterns: [
      /email/i,
      /e\.g\.\s*.*@/i,
      /name@example\.com/i,
    ],
    namePatterns: [
      /email/i,
      /e_?mail/i,
    ],
    idPatterns: [
      /email/i,
      /e_?mail/i,
    ],
  },
  phone: {
    autocomplete: ['tel', 'tel-national', 'phone', 'mobile'],
    labelPatterns: [
      /\bphone\b/i,
      /\bmobile\b/i,
      /\bcell\b/i,
      /\btelephone\b/i,
      /\bcontact\s*number\b/i,
    ],
    placeholderPatterns: [
      /\(xxx\)/,
      /\(\d{3}\)/,
      /phone/i,
      /mobile/i,
      /\+1/i,
    ],
    namePatterns: [
      /phone/i,
      /mobile/i,
      /cell/i,
      /tel/i,
      /contact/i,
    ],
    idPatterns: [
      /phone/i,
      /mobile/i,
      /cell/i,
      /tel/i,
    ],
  },
  city: {
    autocomplete: ['address-level2', 'city', 'locality'],
    labelPatterns: [/\bcity\b/i, /\blocation\b/i, /\bcurrent\s*city\b/i],
    placeholderPatterns: [/city/i, /e\.g\.\s*(new\s*york|san\s*francisco|london)/i],
    namePatterns: [/city/i, /locality/i],
    idPatterns: [/city/i, /locality/i],
  },
  country: {
    autocomplete: ['country', 'country-name', 'country-name-code'],
    labelPatterns: [/\bcountry\b/i, /\bnation\b/i],
    placeholderPatterns: [/country/i, /select\s*country/i],
    namePatterns: [/country/i, /nation/i],
    idPatterns: [/country/i, /nation/i],
  },
  linkedin_url: {
    autocomplete: ['url', 'linkedin'],
    labelPatterns: [
      /\blinkedin\b/i,
      /\blinked\s*in\b/i,
      /\blinkedin\s*(profile|url)\b/i,
    ],
    placeholderPatterns: [
      /linkedin/i,
      /linkedin\.com/i,
      /linked\.in/i,
    ],
    namePatterns: [
      /linkedin/i,
      /linked_?in/i,
      /li_profile/i,
      /li_url/i,
    ],
    idPatterns: [
      /linkedin/i,
      /linked_?in/i,
      /li_profile/i,
      /li_url/i,
    ],
  },
};

/**
 * Check if a string matches any pattern in the array.
 */
function matchesPatterns(value: string | null, patterns: RegExp[]): boolean {
  if (!value) return false;
  return patterns.some((pattern) => pattern.test(value));
}

/**
 * Get associated label text for an input element.
 */
function getAssociatedLabelText(element: HTMLInputElement | HTMLTextAreaElement): string | null {
  // Check for explicit label association via for attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent?.trim() || null;
  }

  // Check for implicit label (input inside label)
  const parentLabel = element.closest('label');
  if (parentLabel) {
    // Get label text excluding the input's value
    const text = parentLabel.textContent?.replace(element.value, '').trim();
    if (text) return text;
  }

  // Check for aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) return labelElement.textContent?.trim() || null;
  }

  // Check for adjacent label (sibling)
  const parent = element.parentElement;
  if (parent) {
    const label = parent.querySelector('label');
    if (label) return label.textContent?.trim() || null;
  }

  return null;
}

/**
 * Calculate score for a single field type.
 */
export function calculateFieldTypeScore(
  element: HTMLInputElement | HTMLTextAreaElement,
  fieldType: FieldType
): number {
  const patterns = FIELD_PATTERNS[fieldType];
  let score = 0;

  // Autocomplete attribute (highest confidence)
  const autocomplete = element.getAttribute('autocomplete');
  if (autocomplete && patterns.autocomplete.includes(autocomplete)) {
    score += SCORE_WEIGHTS.autocomplete;
  }

  // ARIA label
  const ariaLabel = element.getAttribute('aria-label');
  if (matchesPatterns(ariaLabel, patterns.labelPatterns)) {
    score += SCORE_WEIGHTS.ariaLabel;
  }

  // Associated label text
  const labelText = getAssociatedLabelText(element);
  if (matchesPatterns(labelText, patterns.labelPatterns)) {
    score += SCORE_WEIGHTS.labelText;
  }

  // Placeholder text
  if (matchesPatterns(element.placeholder, patterns.placeholderPatterns)) {
    score += SCORE_WEIGHTS.placeholder;
  }

  // Name attribute
  if (matchesPatterns(element.name, patterns.namePatterns)) {
    score += SCORE_WEIGHTS.name;
  }

  // ID attribute
  if (matchesPatterns(element.id, patterns.idPatterns)) {
    score += SCORE_WEIGHTS.id;
  }

  return score;
}

/**
 * Score a field and determine its best matching type.
 */
export function scoreField(
  element: HTMLInputElement | HTMLTextAreaElement
): ScoredField | null {
  // Skip non-text inputs (except email and tel)
  const validTypes = ['text', 'email', 'tel', 'url', ''];
  const inputType = (element as HTMLInputElement).type?.toLowerCase();
  if (inputType && !validTypes.includes(inputType)) {
    return null;
  }

  // Skip disabled or readonly
  if (element.disabled || element.readOnly) {
    return null;
  }

  // Skip hidden
  if (element.type === 'hidden') {
    return null;
  }

  // Skip invisible
  if (element.offsetWidth === 0 && element.offsetHeight === 0) {
    return null;
  }

  // Find best matching field type
  let bestFieldType: FieldType | null = null;
  let bestScore = 0;

  for (const fieldType of Object.keys(FIELD_PATTERNS) as FieldType[]) {
    const score = calculateFieldTypeScore(element, fieldType);
    if (score > bestScore) {
      bestScore = score;
      bestFieldType = fieldType;
    }
  }

  if (!bestFieldType || bestScore < SCORE_THRESHOLD) {
    return null;
  }

  return {
    element,
    fieldType: bestFieldType,
    score: bestScore,
  };
}
