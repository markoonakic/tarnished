import type { Application, Round } from './types';
import { describe, expect, it } from 'vitest';

import {
  getApplicationModalDefaults,
  getApplicationModalValues,
  buildCreateApplicationPayload,
  buildUpdateApplicationPayload,
  isValidApplicationUrl,
  normalizeApplicationUrl,
  splitRequirementLines,
} from './applicationModalForm';

function createApplication(rounds: Round[] = []): Application {
  return {
    status_meaning: 'applied',
    status_meaning_provenance: 'recorded',
    evidence_revision: 0,
    response_state: 'not_recorded',
    response_occurred_on: null,
    response_recorded_at: null,
    response_reference: null,
    id: 'app-1',
    company: 'Acme',
    job_title: 'Engineer',
    job_description: null,
    job_url: null,
    status: {
      id: 'status-1',
      name: 'Applied',
      color: 'aqua',
      meaning: 'applied',
    },
    cv_path: null,
    cover_letter_path: null,
    applied_at: '2026-03-25',
    created_at: '2026-03-25T00:00:00Z',
    updated_at: '2026-03-25T00:00:00Z',
    rounds,
    job_lead_id: null,
    location: null,
    salary_min: 85500,
    salary_max: null,
    salary_currency: null,
    recruiter_name: null,
    recruiter_title: null,
    recruiter_linkedin_url: null,
    requirements_must_have: [],
    requirements_nice_to_have: [],
    skills: [],
    years_experience_min: null,
    years_experience_max: null,
    source: null,
  };
}

describe('application modal form helpers', () => {
  it('adds https to bare application urls', () => {
    expect(normalizeApplicationUrl('example.com/job')).toBe(
      'https://example.com/job'
    );
  });

  it('rejects malformed urls after normalization', () => {
    expect(isValidApplicationUrl('https://not a url')).toBe(false);
  });

  it('converts requirement textareas into trimmed arrays', () => {
    expect(splitRequirementLines(' React  \n\n TypeScript \n')).toEqual([
      'React',
      'TypeScript',
    ]);
  });

  it('builds create payloads with undefined optional fields', () => {
    expect(
      buildCreateApplicationPayload({
        company: 'Acme',
        jobTitle: 'Engineer',
        jobDescription: '',
        jobUrl: 'example.com/job',
        statusId: 'status-1',
        appliedAt: '2026-03-25',
        salaryMin: '',
        salaryMax: '150000',
        salaryCurrency: 'USD',
        recruiterName: '',
        recruiterTitle: 'Recruiter',
        recruiterLinkedinUrl: '',
        requirementsMustHave: 'React',
        requirementsNiceToHave: '',
        source: '',
      })
    ).toEqual({
      company: 'Acme',
      job_title: 'Engineer',
      job_description: undefined,
      job_url: 'https://example.com/job',
      status_id: 'status-1',
      applied_at: '2026-03-25',
      salary_min: undefined,
      salary_max: 150000,
      salary_currency: 'USD',
      recruiter_name: undefined,
      recruiter_title: 'Recruiter',
      recruiter_linkedin_url: undefined,
      requirements_must_have: ['React'],
      requirements_nice_to_have: undefined,
      source: undefined,
    });
  });

  it('builds update payloads with null optional fields', () => {
    expect(
      buildUpdateApplicationPayload({
        company: 'Acme',
        jobTitle: 'Engineer',
        jobDescription: '',
        jobUrl: '',
        statusId: 'status-1',
        appliedAt: '2026-03-25',
        salaryMin: '',
        salaryMax: '',
        salaryCurrency: '',
        recruiterName: '',
        recruiterTitle: '',
        recruiterLinkedinUrl: '',
        requirementsMustHave: '',
        requirementsNiceToHave: 'Docker',
        source: '',
      })
    ).toEqual({
      company: 'Acme',
      job_title: 'Engineer',
      job_description: null,
      job_url: null,
      status_id: 'status-1',
      applied_at: '2026-03-25',
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      recruiter_name: null,
      recruiter_title: null,
      recruiter_linkedin_url: null,
      requirements_must_have: null,
      requirements_nice_to_have: ['Docker'],
      source: null,
    });
  });
});

it('preserves 85,500 through unchanged edit in full currency units', () => {
  const values = getApplicationModalValues(createApplication());
  expect(values.salaryMin).toBe('85500');
  expect(buildUpdateApplicationPayload(values).salary_min).toBe(85500);
});
it.each([
  '85.5',
  '85500garbage',
  'NaN',
  'Infinity',
  '9007199254740992',
  '85500.000000000001',
  '1e-999',
  '9007199254740991.1',
  '1.00000000000000001e2',
  '0x10',
  ' ',
  '.',
  'e2',
])(
  'rejects invalid full-unit salary %s without rounding in either payload',
  (salary) => {
    for (const build of [
      buildCreateApplicationPayload,
      buildUpdateApplicationPayload,
    ]) {
      for (const field of ['salaryMin', 'salaryMax']) {
        expect(() =>
          build({
            ...getApplicationModalValues(createApplication()),
            [field]: salary,
          })
        ).toThrow('whole amount');
      }
    }
  }
);
it.each([
  ['85500.00', 85500],
  ['8.55e4', 85500],
  ['855000e-1', 85500],
  ['0e-999', 0],
  ['.0', 0],
  ['+12', 12],
  [' 42 ', 42],
  ['9007199254740991', Number.MAX_SAFE_INTEGER],
])(
  'accepts exact whole-unit salary %s in either payload',
  (salaryMin, expected) => {
    const values = {
      ...getApplicationModalValues(createApplication()),
      salaryMin: String(salaryMin),
    };
    expect(buildCreateApplicationPayload(values).salary_min).toBe(expected);
    expect(buildUpdateApplicationPayload(values).salary_min).toBe(expected);
  }
);
it('omits an unset creation date for the backend effective-zone default', () => {
  expect(
    JSON.parse(
      JSON.stringify(
        buildCreateApplicationPayload(getApplicationModalDefaults([]))
      )
    )
  ).not.toHaveProperty('applied_at');
});
