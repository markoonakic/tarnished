/**
 * Autofill module for filling job application forms with user profile data.
 *
 * Uses fuzzy matching on input names/ids/placeholders to find relevant fields.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * User profile data for autofill.
 * Matches the backend UserProfile schema.
 */
export interface AutofillProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
}

/**
 * Maps a profile field to CSS selectors for finding matching inputs.
 */
interface FieldMapping {
  profileField: keyof AutofillProfile;
  selectors: string[];
}

// ============================================================================
// Field Mappings
// ============================================================================

/**
 * Field mappings with fuzzy selectors for common form patterns.
 */
const fieldMappings: FieldMapping[] = [
  {
    profileField: 'first_name',
    selectors: [
      'input[name*="first"]',
      'input[id*="first"]',
      'input[placeholder*="first" i]',
      'input[name*="fname"]',
      'input[id*="fname"]',
    ],
  },
  {
    profileField: 'last_name',
    selectors: [
      'input[name*="last"]',
      'input[id*="last"]',
      'input[placeholder*="last" i]',
      'input[name*="surname"]',
      'input[id*="surname"]',
      'input[name*="lname"]',
      'input[id*="lname"]',
    ],
  },
  {
    profileField: 'email',
    selectors: [
      'input[type="email"]',
      'input[name*="email"]',
      'input[id*="email"]',
      'input[placeholder*="email" i]',
    ],
  },
  {
    profileField: 'phone',
    selectors: [
      'input[type="tel"]',
      'input[name*="phone"]',
      'input[id*="phone"]',
      'input[name*="mobile"]',
      'input[id*="mobile"]',
      'input[name*="cell"]',
      'input[id*="cell"]',
    ],
  },
  {
    profileField: 'location',
    selectors: [
      'input[name*="location"]',
      'input[id*="location"]',
      'input[name*="city"]',
      'input[id*="city"]',
      'input[name*="address"]',
      'input[id*="address"]',
      'input[placeholder*="city" i]',
      'input[placeholder*="location" i]',
    ],
  },
  {
    profileField: 'linkedin_url',
    selectors: [
      'input[name*="linkedin"]',
      'input[id*="linkedin"]',
      'input[placeholder*="linkedin" i]',
      'input[name*="linkedin_url"]',
      'input[id*="linkedin_url"]',
    ],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if an input element is fillable.
 * - Must be text, email, or tel type
 * - Must not be disabled or readonly
 * - Must be empty or have only whitespace
 */
function isFillable(input: HTMLInputElement): boolean {
  // Check input type
  const validTypes = ['text', 'email', 'tel', ''];
  if (!validTypes.includes(input.type.toLowerCase())) {
    return false;
  }

  // Check if disabled or readonly
  if (input.disabled || input.readOnly) {
    return false;
  }

  // Check if already filled
  if (input.value.trim() !== '') {
    return false;
  }

  // Check if visible (has dimensions)
  if (input.offsetWidth === 0 && input.offsetHeight === 0) {
    return false;
  }

  return true;
}

/**
 * Truncates a value to fit within the input's maxlength constraint.
 */
function truncateToMaxLength(value: string, input: HTMLInputElement): string {
  const maxLength = input.maxLength;
  // maxLength of -1 means no limit
  if (maxLength > 0 && value.length > maxLength) {
    return value.substring(0, maxLength);
  }
  return value;
}

/**
 * Fills a single input field with a value.
 * Dispatches input and change events to trigger form validation.
 *
 * @returns true if the field was filled, false otherwise
 */
function fillField(input: HTMLInputElement, value: string): boolean {
  if (!isFillable(input)) {
    return false;
  }

  const truncatedValue = truncateToMaxLength(value, input);
  input.value = truncatedValue;

  // Dispatch events to trigger form validation and React state updates
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
}

/**
 * Finds all fillable input elements matching the given selectors.
 */
function findInputElements(selectors: string[]): HTMLInputElement[] {
  const inputs: HTMLInputElement[] = [];

  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll<HTMLInputElement>(selector);
      for (const element of elements) {
        if (!inputs.includes(element)) {
          inputs.push(element);
        }
      }
    } catch {
      // Invalid selector, skip
    }
  }

  return inputs;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Autofills form fields on the current page using the provided profile data.
 *
 * @param profile - User profile containing data to fill
 * @returns Number of fields successfully filled
 */
export async function autofillForm(profile: AutofillProfile): Promise<number> {
  let filledCount = 0;

  for (const mapping of fieldMappings) {
    const value = profile[mapping.profileField];

    // Skip if profile field is empty
    if (!value || value.trim() === '') {
      continue;
    }

    // Find matching inputs
    const inputs = findInputElements(mapping.selectors);

    // Fill each fillable input
    for (const input of inputs) {
      if (fillField(input, value)) {
        filledCount++;
      }
    }
  }

  return filledCount;
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
    !!profile.location ||
    !!profile.linkedin_url
  );
}
