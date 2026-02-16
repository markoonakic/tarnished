/**
 * User profile data for autofill.
 */
export interface AutofillProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
}

/**
 * Supported field types for autofill.
 */
export type FieldType =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'city'
  | 'country'
  | 'linkedin_url';

/**
 * Pattern configuration for a field type.
 */
export interface FieldPattern {
  autocomplete: string[];
  labelPatterns: RegExp[];
  placeholderPatterns: RegExp[];
  namePatterns: RegExp[];
  idPatterns: RegExp[];
}

/**
 * Scored field candidate.
 */
export interface ScoredField {
  element: HTMLInputElement | HTMLTextAreaElement;
  fieldType: FieldType;
  score: number;
}

/**
 * Result of form scanning.
 */
export interface FormScanResult {
  hasApplicationForm: boolean;
  fillableFields: ScoredField[];
  totalRelevantFields: number;
}

/**
 * Result of autofill operation.
 */
export interface AutofillResult {
  filledCount: number;
  skippedCount: number;
  fields: {
    fieldType: FieldType;
    filled: boolean;
    score: number;
  }[];
}

/**
 * Checks if the profile has any data that can be used for autofill.
 */
export function hasAutofillData(profile: AutofillProfile | null): boolean {
  if (!profile) {
    return false;
  }

  return (
    !!profile.first_name ||
    !!profile.last_name ||
    !!profile.email ||
    !!profile.phone ||
    !!profile.city ||
    !!profile.country ||
    !!profile.linkedin_url
  );
}
