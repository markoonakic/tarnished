import { describe, expect, it } from 'vitest';

import {
  buildCreateApplicationPayload,
  buildUpdateApplicationPayload,
  isValidApplicationUrl,
  normalizeApplicationUrl,
  splitRequirementLines,
} from './applicationModalForm';

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
        salaryMax: '150',
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
