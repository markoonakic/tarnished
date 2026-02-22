/**
 * Main autofill engine that orchestrates detection and filling.
 */

import type { AutofillProfile, AutofillResult, FieldType } from './types';
import { scanForFillableFields } from './detection';
import { fillField } from './filling';

/**
 * Field type to profile field mapping.
 */
const FIELD_TO_PROFILE: Record<
  FieldType,
  keyof AutofillProfile | '__combined__'
> = {
  first_name: 'first_name',
  last_name: 'last_name',
  full_name: '__combined__', // Special handling: combines first_name + last_name
  email: 'email',
  phone: 'phone',
  city: 'city',
  country: 'country',
  linkedin_url: 'linkedin_url',
};

/**
 * Get the value for a field type from the profile.
 * Handles combined fields like full_name.
 */
function getFieldValue(
  fieldType: FieldType,
  profile: AutofillProfile
): string | null {
  if (fieldType === 'full_name') {
    const parts = [profile.first_name, profile.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  }

  const profileKey = FIELD_TO_PROFILE[fieldType] as keyof AutofillProfile;
  return profile[profileKey];
}

/**
 * Autofill engine class.
 */
export class AutofillEngine {
  private lastScanResult: ReturnType<typeof scanForFillableFields> | null =
    null;

  /**
   * Scan the page for fillable fields.
   */
  scan(): ReturnType<typeof scanForFillableFields> {
    this.lastScanResult = scanForFillableFields();
    return this.lastScanResult;
  }

  /**
   * Get the last scan result without re-scanning.
   */
  getLastScanResult(): ReturnType<typeof scanForFillableFields> | null {
    return this.lastScanResult;
  }

  /**
   * Fill all detected fields with profile data.
   */
  fill(profile: AutofillProfile): AutofillResult {
    const scanResult = this.scan();
    const result: AutofillResult = {
      filledCount: 0,
      skippedCount: 0,
      fields: [],
    };

    for (const scoredField of scanResult.fillableFields) {
      const value = getFieldValue(scoredField.fieldType, profile);

      const fieldResult = {
        fieldType: scoredField.fieldType,
        filled: false,
        score: scoredField.score,
      };

      if (!value || value.trim() === '') {
        result.skippedCount++;
        result.fields.push(fieldResult);
        continue;
      }

      const filled = fillField(scoredField.element, value);
      fieldResult.filled = filled;

      if (filled) {
        result.filledCount++;
      } else {
        result.skippedCount++;
      }

      result.fields.push(fieldResult);
    }

    return result;
  }

  /**
   * Check if the page has fillable fields.
   */
  hasFillableFields(): boolean {
    const result = this.scan();
    return result.fillableFields.length > 0;
  }

  /**
   * Check if the page appears to be an application form.
   */
  isApplicationForm(): boolean {
    const result = this.scan();
    return result.hasApplicationForm;
  }

  /**
   * Get count of fillable fields.
   */
  getFillableFieldCount(): number {
    const result = this.scan();
    return result.fillableFields.length;
  }
}

/**
 * Singleton instance for use in content script.
 */
let engineInstance: AutofillEngine | null = null;

/**
 * Get or create the autofill engine instance.
 */
export function getAutofillEngine(): AutofillEngine {
  if (!engineInstance) {
    engineInstance = new AutofillEngine();
  }
  return engineInstance;
}

/**
 * Reset the engine instance (useful for testing).
 */
export function resetAutofillEngine(): void {
  engineInstance = null;
}
