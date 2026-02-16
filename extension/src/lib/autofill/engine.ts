/**
 * Main autofill engine that orchestrates detection and filling.
 */

import type { AutofillProfile, AutofillResult, FieldType } from './types';
import { scanForFillableFields } from './detection';
import { fillField } from './filling';

/**
 * Field type to profile field mapping.
 */
const FIELD_TO_PROFILE: Record<FieldType, keyof AutofillProfile> = {
  first_name: 'first_name',
  last_name: 'last_name',
  email: 'email',
  phone: 'phone',
  location: 'location',
  linkedin_url: 'linkedin_url',
};

/**
 * Autofill engine class.
 */
export class AutofillEngine {
  private lastScanResult: ReturnType<typeof scanForFillableFields> | null = null;

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
      const profileKey = FIELD_TO_PROFILE[scoredField.fieldType];
      const value = profile[profileKey];

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
