/**
 * Autofill module for filling job application forms.
 *
 * Uses heuristic scoring for field detection and native prototype setters
 * for reliable filling across React/Vue frameworks.
 */

export * from './types';
export {
  AutofillEngine,
  getAutofillEngine,
  resetAutofillEngine,
} from './engine';
export {
  scoreField,
  calculateFieldTypeScore,
  FIELD_PATTERNS,
  SCORE_WEIGHTS,
  SCORE_THRESHOLD,
} from './scoring';
export { fillField, fillFields, setNativeValue } from './filling';
export {
  scanForFillableFields,
  detectApplicationForm,
  rescanForFields,
} from './detection';
