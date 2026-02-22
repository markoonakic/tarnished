/**
 * Iframe scanner module - injected into iframes to scan for fillable fields.
 *
 * This script runs in the context of an iframe and:
 * 1. Scans for fillable form fields
 * 2. Reports results to the parent frame via postMessage
 * 3. Listens for autofill commands from the parent frame
 *
 * NOTE: This file is self-contained (no external dependencies) because it's
 * injected into iframes and must work independently.
 *
 * Wrapped in IIFE to prevent const redeclaration errors when injected multiple times.
 */

(function iframeScanner() {
  // Guard against re-injection
  if ((window as any).__tarnishedIframeScannerInitialized) {
    return;
  }
  (window as any).__tarnishedIframeScannerInitialized = true;

  // ============================================================================
  // Types (inlined from types.ts)
  // ============================================================================

  type FieldType =
    | 'first_name'
    | 'last_name'
    | 'full_name'
    | 'email'
    | 'phone'
    | 'city'
    | 'country'
    | 'linkedin_url';

  interface FieldPattern {
    autocomplete: string[];
    labelPatterns: RegExp[];
    placeholderPatterns: RegExp[];
    namePatterns: RegExp[];
    idPatterns: RegExp[];
  }

  interface AutofillProfile {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    country: string | null;
    linkedin_url: string | null;
  }

  interface FormScanResult {
    hasApplicationForm: boolean;
    fillableFields: Array<{
      element: HTMLInputElement | HTMLTextAreaElement;
      fieldType: FieldType;
      score: number;
    }>;
    totalRelevantFields: number;
  }

  // ============================================================================
  // Field Patterns (inlined from scoring.ts)
  // ============================================================================

  const SCORE_THRESHOLD = 30;
  const SCORE_WEIGHTS = {
    autocomplete: 100,
    ariaLabel: 50,
    labelText: 60,
    placeholder: 40,
    name: 30,
    id: 20,
  } as const;

  const FIELD_PATTERNS: Record<FieldType, FieldPattern> = {
    first_name: {
      autocomplete: ['given-name', 'fname', 'firstname'],
      labelPatterns: [
        /\bfirst\s*name\b/i,
        /\bfname\b/i,
        /\bgiven\s*name\b/i,
        /^first$/i,
      ],
      placeholderPatterns: [/first\s*name/i, /e\.g\.\s*john/i, /^first$/i],
      namePatterns: [/first_?name/i, /fname/i, /given_?name/i],
      idPatterns: [/first_?name/i, /fname/i, /given_?name/i],
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
      namePatterns: [/last_?name/i, /lname/i, /surname/i, /family_?name/i],
      idPatterns: [/last_?name/i, /lname/i, /surname/i, /family_?name/i],
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
      labelPatterns: [/\bemail\b/i, /\be-?mail\s*address\b/i],
      placeholderPatterns: [/email/i, /e\.g\.\s*.*@/i, /name@example\.com/i],
      namePatterns: [/email/i, /e_?mail/i],
      idPatterns: [/email/i, /e_?mail/i],
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
      namePatterns: [/phone/i, /mobile/i, /cell/i, /tel/i, /contact/i],
      idPatterns: [/phone/i, /mobile/i, /cell/i, /tel/i],
    },
    city: {
      autocomplete: ['address-level2', 'city', 'locality'],
      labelPatterns: [/\bcity\b/i, /\blocation\b/i, /\bcurrent\s*city\b/i],
      placeholderPatterns: [
        /city/i,
        /e\.g\.\s*(new\s*york|san\s*francisco|london)/i,
      ],
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
      placeholderPatterns: [/linkedin/i, /linkedin\.com/i, /linked\.in/i],
      namePatterns: [/linkedin/i, /linked_?in/i, /li_profile/i, /li_url/i],
      idPatterns: [/linkedin/i, /linked_?in/i, /li_profile/i, /li_url/i],
    },
  };

  // ============================================================================
  // Scoring Functions (inlined from scoring.ts)
  // ============================================================================

  function matchesPatterns(value: string | null, patterns: RegExp[]): boolean {
    if (!value) return false;
    return patterns.some((pattern) => pattern.test(value));
  }

  function getAssociatedLabelText(
    element: HTMLInputElement | HTMLTextAreaElement
  ): string | null {
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent?.trim() || null;
    }
    const parentLabel = element.closest('label');
    if (parentLabel) {
      const text = parentLabel.textContent?.replace(element.value, '').trim();
      if (text) return text;
    }
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelElement = document.getElementById(labelledBy);
      if (labelElement) return labelElement.textContent?.trim() || null;
    }
    const parent = element.parentElement;
    if (parent) {
      const label = parent.querySelector('label');
      if (label) return label.textContent?.trim() || null;
    }
    return null;
  }

  function calculateFieldTypeScore(
    element: HTMLInputElement | HTMLTextAreaElement,
    fieldType: FieldType
  ): number {
    const patterns = FIELD_PATTERNS[fieldType];
    let score = 0;

    const autocomplete = element.getAttribute('autocomplete');
    if (autocomplete && patterns.autocomplete.includes(autocomplete)) {
      score += SCORE_WEIGHTS.autocomplete;
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (matchesPatterns(ariaLabel, patterns.labelPatterns)) {
      score += SCORE_WEIGHTS.ariaLabel;
    }

    const labelText = getAssociatedLabelText(element);
    if (matchesPatterns(labelText, patterns.labelPatterns)) {
      score += SCORE_WEIGHTS.labelText;
    }

    if (matchesPatterns(element.placeholder, patterns.placeholderPatterns)) {
      score += SCORE_WEIGHTS.placeholder;
    }

    if (matchesPatterns(element.name, patterns.namePatterns)) {
      score += SCORE_WEIGHTS.name;
    }

    if (matchesPatterns(element.id, patterns.idPatterns)) {
      score += SCORE_WEIGHTS.id;
    }

    return score;
  }

  function scoreField(
    element: HTMLInputElement | HTMLTextAreaElement
  ): {
    element: HTMLInputElement | HTMLTextAreaElement;
    fieldType: FieldType;
    score: number;
  } | null {
    const validTypes = ['text', 'email', 'tel', 'url', ''];
    const inputType = (element as HTMLInputElement).type?.toLowerCase();
    if (inputType && !validTypes.includes(inputType)) {
      return null;
    }
    if (element.disabled || element.readOnly) {
      return null;
    }
    if (element.type === 'hidden') {
      return null;
    }
    if (element.offsetWidth === 0 && element.offsetHeight === 0) {
      return null;
    }

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

    return { element, fieldType: bestFieldType, score: bestScore };
  }

  // ============================================================================
  // Detection Functions (inlined from detection.ts)
  // ============================================================================

  const MIN_RELEVANT_FIELDS = 2;

  function hasRelevantPatterns(
    element: HTMLInputElement | HTMLTextAreaElement
  ): boolean {
    if (element.disabled || element.readOnly || element.type === 'hidden') {
      return false;
    }

    for (const fieldType of Object.keys(FIELD_PATTERNS) as FieldType[]) {
      const patterns = FIELD_PATTERNS[fieldType];

      const autocomplete = element.getAttribute('autocomplete');
      if (autocomplete && patterns.autocomplete.includes(autocomplete)) {
        return true;
      }

      if (
        patterns.placeholderPatterns.some((p) =>
          p.test(element.placeholder || '')
        )
      ) {
        return true;
      }

      if (patterns.namePatterns.some((p) => p.test(element.name || ''))) {
        return true;
      }

      if (patterns.idPatterns.some((p) => p.test(element.id || ''))) {
        return true;
      }
    }

    return false;
  }

  function scanForFillableFields(): FormScanResult {
    const inputs = document.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), textarea'
    );

    const fillableFields: Array<{
      element: HTMLInputElement | HTMLTextAreaElement;
      fieldType: FieldType;
      score: number;
    }> = [];
    let totalRelevantFields = 0;

    for (const input of inputs) {
      const scored = scoreField(input);

      if (scored) {
        fillableFields.push(scored);
      }

      if (hasRelevantPatterns(input)) {
        totalRelevantFields++;
      }
    }

    fillableFields.sort((a, b) => b.score - a.score);

    const seenTypes = new Set<FieldType>();
    const dedupedFields: typeof fillableFields = [];

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

  // ============================================================================
  // Filling Functions (inlined from filling.ts)
  // ============================================================================

  function setNativeValue(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ): void {
    const prototype = Object.getPrototypeOf(element);
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
  }

  function truncateToMaxLength(
    value: string,
    element: HTMLInputElement | HTMLTextAreaElement
  ): string {
    const maxLength = (element as HTMLInputElement).maxLength;
    if (maxLength > 0 && value.length > maxLength) {
      return value.substring(0, maxLength);
    }
    return value;
  }

  function isFillable(
    element: HTMLInputElement | HTMLTextAreaElement
  ): boolean {
    if (element.disabled || element.readOnly) {
      return false;
    }
    if (element.value.trim() !== '') {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
    return true;
  }

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

    try {
      element.focus();
      setNativeValue(element, truncatedValue);
      element.dispatchEvent(
        new Event('input', { bubbles: true, composed: true })
      );
      element.dispatchEvent(
        new Event('change', { bubbles: true, composed: true })
      );
      element.blur();
      return true;
    } catch {
      return element.value === truncatedValue;
    }
  }

  // ============================================================================
  // Message Constants
  // ============================================================================

  const MESSAGE_PREFIX = 'TARNISHED_';
  const SCAN_RESULT_MSG = `${MESSAGE_PREFIX}IFRAME_SCAN_RESULT`;
  const AUTOFILL_MSG = `${MESSAGE_PREFIX}IFRAME_AUTOFILL`;

  // ============================================================================
  // Profile Value Mapping
  // ============================================================================

  const FIELD_TO_PROFILE: Record<
    FieldType,
    keyof AutofillProfile | '__combined__'
  > = {
    first_name: 'first_name',
    last_name: 'last_name',
    full_name: '__combined__',
    email: 'email',
    phone: 'phone',
    city: 'city',
    country: 'country',
    linkedin_url: 'linkedin_url',
  };

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

  // ============================================================================
  // Scanner Logic
  // ============================================================================

  function scanAndReport(): void {
    const result = scanForFillableFields();

    if (result.fillableFields.length > 0 || result.hasApplicationForm) {
      window.parent.postMessage(
        {
          type: SCAN_RESULT_MSG,
          payload: {
            hasApplicationForm: result.hasApplicationForm,
            fillableFieldCount: result.fillableFields.length,
            totalRelevantFields: result.totalRelevantFields,
            fields: result.fillableFields.map((f) => ({
              fieldType: f.fieldType,
              score: f.score,
              id: f.element.id,
              name: f.element.name,
              placeholder: f.element.placeholder,
            })),
          },
        },
        '*'
      );
    }
  }

  function handleAutofill(profile: AutofillProfile): void {
    const result = scanForFillableFields();
    let filledCount = 0;

    for (const scoredField of result.fillableFields) {
      const value = getFieldValue(scoredField.fieldType, profile);
      if (value && value.trim() !== '') {
        const filled = fillField(scoredField.element, value);
        if (filled) {
          filledCount++;
        }
      }
    }

    window.parent.postMessage(
      {
        type: `${MESSAGE_PREFIX}IFRAME_AUTOFILL_RESULT`,
        payload: { filledCount },
      },
      '*'
    );
  }

  function setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) {
        return;
      }

      const { type, payload } = event.data || {};

      if (type === AUTOFILL_MSG && payload?.profile) {
        handleAutofill(payload.profile as AutofillProfile);
      }
    });
  }

  function setupMutationObserver(): void {
    let scanTimeout: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              if (
                node.tagName === 'INPUT' ||
                node.tagName === 'TEXTAREA' ||
                node.querySelector('input, textarea')
              ) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        if (scanTimeout) clearTimeout(scanTimeout);
        scanTimeout = setTimeout(() => {
          scanAndReport();
          scanTimeout = null;
        }, 250);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  function init(): void {
    if (window.self === window.top) {
      return;
    }

    console.log('[Tarnished] Iframe scanner initialized');

    setupMessageListener();

    if (document.readyState === 'complete') {
      scanAndReport();
      setupMutationObserver();
    } else {
      window.addEventListener('load', () => {
        scanAndReport();
        setupMutationObserver();
      });
    }
  }

  init();
})();
