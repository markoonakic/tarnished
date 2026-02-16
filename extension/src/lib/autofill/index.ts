/**
 * Autofill module for filling job application forms.
 *
 * Uses heuristic scoring for field detection and native prototype setters
 * for reliable filling across React/Vue frameworks.
 */

export * from './types';
export { AutofillEngine } from './engine';
export { scoreField, FIELD_PATTERNS } from './scoring';
export { fillField, setNativeValue } from './filling';
export { scanForFillableFields, detectApplicationForm } from './detection';
