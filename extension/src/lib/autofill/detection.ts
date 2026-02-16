/**
 * Form detection utilities.
 *
 * Scans the page for fillable form fields and detects
 * when the user is on an application form.
 */

import type { FormScanResult, ScoredField, FieldType } from './types';
import { scoreField, FIELD_PATTERNS } from './scoring';

/**
 * Minimum number of relevant fields to consider this an application form.
 */
const MIN_RELEVANT_FIELDS = 2;

/**
 * Low score threshold for "relevant" fields (not necessarily fillable).
 */
const RELEVANT_SCORE_THRESHOLD = 30;

/**
 * Check if an element has any relevant patterns (low threshold).
 */
function hasRelevantPatterns(
  element: HTMLInputElement | HTMLTextAreaElement
): boolean {
  // Skip disabled/readonly/hidden
  if (element.disabled || element.readOnly || element.type === 'hidden') {
    return false;
  }

  for (const fieldType of Object.keys(FIELD_PATTERNS) as FieldType[]) {
    const patterns = FIELD_PATTERNS[fieldType];

    // Check autocomplete
    const autocomplete = element.getAttribute('autocomplete');
    if (autocomplete && patterns.autocomplete.includes(autocomplete)) {
      return true;
    }

    // Check placeholder
    if (patterns.placeholderPatterns.some(p => p.test(element.placeholder || ''))) {
      return true;
    }

    // Check name
    if (patterns.namePatterns.some(p => p.test(element.name || ''))) {
      return true;
    }

    // Check id
    if (patterns.idPatterns.some(p => p.test(element.id || ''))) {
      return true;
    }
  }

  return false;
}

/**
 * Scan the page for fillable form fields.
 */
export function scanForFillableFields(): FormScanResult {
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), textarea'
  );

  const fillableFields: ScoredField[] = [];
  let totalRelevantFields = 0;

  for (const input of inputs) {
    const scored = scoreField(input);

    if (scored) {
      fillableFields.push(scored);
    }

    // Count fields with low score as "relevant" for form detection
    if (hasRelevantPatterns(input)) {
      totalRelevantFields++;
    }
  }

  // Sort by score (highest first) and dedupe by field type
  fillableFields.sort((a, b) => b.score - a.score);

  // Keep only the highest-scored field for each type
  const seenTypes = new Set<FieldType>();
  const dedupedFields: ScoredField[] = [];

  for (const field of fillableFields) {
    if (!seenTypes.has(field.fieldType)) {
      seenTypes.add(field.fieldType);
      dedupedFields.push(field);
    }
  }

  return {
    hasApplicationForm: totalRelevantFields >= MIN_RELEVANT_FIELDS,
    fillableFields: dedupedFields,
    totalRelevantFields,
  };
}

/**
 * Detect if the current page contains an application form.
 */
export function detectApplicationForm(): boolean {
  const result = scanForFillableFields();
  return result.hasApplicationForm;
}

/**
 * Re-scan for fields (useful after DOM changes).
 */
export function rescanForFields(): FormScanResult {
  return scanForFillableFields();
}
