import type { AutofillProfile } from './types';
import { scanForFillableFields } from './detection';

/** Bypasses React's value interceptor with the native setter. */
function setNativeValue(
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
  if (maxLength >= 0 && value.length > maxLength) {
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

/** Uses native setters and the focus/input/change/blur sequence for framework forms. */
function fillField(
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
  if (!truncatedValue) return false;

  try {
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
  } catch {
    // If the page's event handlers throw errors, still consider it filled
    // if the value was set
    return element.value === truncatedValue;
  }
}

export function fillProfile(profile: AutofillProfile): number {
  let filledCount = 0;
  for (const { element, fieldType } of scanForFillableFields().fillableFields) {
    const value =
      fieldType === 'full_name'
        ? [profile.first_name, profile.last_name].filter(Boolean).join(' ')
        : profile[fieldType];
    if (value && fillField(element, value)) filledCount++;
  }
  return filledCount;
}
