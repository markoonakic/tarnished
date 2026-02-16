/**
 * Filling utilities for form fields.
 *
 * Uses native prototype setters to bypass React/Vue value interception
 * and dispatches the full event sequence for proper state synchronization.
 */

/**
 * Set the value of an input using the native prototype setter.
 * This bypasses React's value interceptor.
 */
export function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const prototype = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter) {
    setter.call(element, value);
  } else {
    // Fallback for browsers without prototype access
    element.value = value;
  }
}

/**
 * Truncate a value to fit within the input's maxlength constraint.
 */
function truncateToMaxLength(
  value: string,
  element: HTMLInputElement | HTMLTextAreaElement
): string {
  const maxLength = (element as HTMLInputElement).maxLength;
  // maxLength of -1 means no limit
  if (maxLength > 0 && value.length > maxLength) {
    return value.substring(0, maxLength);
  }
  return value;
}

/**
 * Check if an element is fillable.
 */
function isFillable(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  // Skip if disabled or readonly
  if (element.disabled || element.readOnly) {
    return false;
  }

  // Skip if already filled (allow whitespace-only)
  if (element.value.trim() !== '') {
    return false;
  }

  // Skip if not visible
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }

  return true;
}

/**
 * Fill a single field with the full event sequence.
 *
 * Sequence:
 * 1. Focus - initializes framework handlers
 * 2. Set native value - bypasses React interception
 * 3. Dispatch input - triggers React onChange
 * 4. Dispatch change - triggers legacy validation
 * 5. Blur - triggers validation and enables submit buttons
 *
 * @returns true if the field was filled, false otherwise
 */
export function fillField(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): boolean {
  if (!isFillable(element)) {
    return false;
  }

  if (!value || value.trim() === '') {
    return false;
  }

  const truncatedValue = truncateToMaxLength(value, element);

  // 1. Focus - initializes framework handlers ("touched" state)
  element.focus();

  // 2. Set value using native setter (bypasses React interception)
  setNativeValue(element, truncatedValue);

  // 3. Dispatch input event (triggers React onChange)
  element.dispatchEvent(
    new Event('input', { bubbles: true, composed: true })
  );

  // 4. Dispatch change event (triggers legacy validation)
  element.dispatchEvent(
    new Event('change', { bubbles: true, composed: true })
  );

  // 5. Blur - triggers final validation and "enable submit" logic
  element.blur();

  return true;
}

/**
 * Fill multiple fields in sequence.
 *
 * @returns Number of fields successfully filled
 */
export function fillFields(
  fields: Array<{
    element: HTMLInputElement | HTMLTextAreaElement;
    value: string;
  }>
): number {
  let filledCount = 0;

  for (const { element, value } of fields) {
    if (fillField(element, value)) {
      filledCount++;
    }
  }

  return filledCount;
}
