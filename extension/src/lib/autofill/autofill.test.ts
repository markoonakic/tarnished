import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fillProfile,
  scanForFillableFields,
  type AutofillProfile,
} from './index';

const profile: AutofillProfile = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  city: null,
  country: null,
  linkedin_url: 'https://linkedin.com/in/ada',
};

function render(html: string) {
  document.body.innerHTML = html;
  // jsdom does not calculate layout.
  for (const element of document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >('input, textarea')) {
    Object.defineProperties(element, {
      offsetWidth: { value: 160 },
      offsetHeight: { value: 24 },
    });
    element.getBoundingClientRect = () => new DOMRect(0, 0, 160, 24);
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('shared autofill', () => {
  it('uses native label associations even when an ID contains quotes', () => {
    render(
      '<label for="first&quot;name">First name</label><input id="first&quot;name"><input autocomplete="email">'
    );
    expect(
      scanForFillableFields().fillableFields.map((field) => field.fieldType)
    ).toEqual(['email', 'first_name']);
    expect(fillProfile(profile)).toBe(2);
    expect(document.querySelector('input')?.value).toBe('Ada');
  });

  it('supports text areas and multiple aria-labelledby references', () => {
    render(
      '<span id="first">First</span><span id="name">name</span><textarea aria-labelledby="first name"></textarea>'
    );
    expect(fillProfile(profile)).toBe(1);
    expect(document.querySelector('textarea')?.value).toBe('Ada');
  });

  it('keeps existing, disabled and readonly values unchanged', () => {
    render(
      '<input autocomplete="given-name" value="Existing"><input autocomplete="email" disabled><input autocomplete="family-name" readonly>'
    );
    expect(fillProfile(profile)).toBe(0);
    expect(document.querySelector('input')?.value).toBe('Existing');
  });

  it('honours a zero maximum length and truncates other fields', () => {
    render(
      '<input autocomplete="given-name" maxlength="0"><input autocomplete="family-name" maxlength="4">'
    );
    expect(fillProfile(profile)).toBe(1);
    expect(
      Array.from(document.querySelectorAll('input'), (element) => element.value)
    ).toEqual(['', 'Love']);
  });

  it('does not fill a generic website URL with a LinkedIn profile', () => {
    render(
      '<input type="url" autocomplete="url" aria-label="Personal website">'
    );
    expect(fillProfile(profile)).toBe(0);
    expect(document.querySelector('input')?.value).toBe('');
  });

  it('notifies page handlers after setting the native value', () => {
    render('<input autocomplete="given-name">');
    const element = document.querySelector('input')!;
    const input = vi.fn();
    const change = vi.fn();
    element.addEventListener('input', input);
    element.addEventListener('change', change);
    expect(fillProfile(profile)).toBe(1);
    expect(input).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledOnce();
    expect(element.value).toBe('Ada');
  });
});
