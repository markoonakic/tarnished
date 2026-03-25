import type {
  Application,
  ApplicationCreate,
  ApplicationUpdate,
  Status,
} from './types';

export type ApplicationModalFormValues = {
  company: string;
  jobTitle: string;
  jobDescription: string;
  jobUrl: string;
  statusId: string;
  appliedAt: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  recruiterName: string;
  recruiterTitle: string;
  recruiterLinkedinUrl: string;
  requirementsMustHave: string;
  requirementsNiceToHave: string;
  source: string;
};

export function normalizeApplicationUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed && !trimmed.match(/^https?:\/\//i)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function isValidApplicationUrl(url: string): boolean {
  if (!url) return true;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function splitRequirementLines(value: string): string[] | null {
  const items = value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : null;
}

function parseSalary(value: string): number | null {
  return value ? parseInt(value, 10) * 1000 : null;
}

export function buildCreateApplicationPayload(
  values: ApplicationModalFormValues
): ApplicationCreate {
  const normalizedUrl = normalizeApplicationUrl(values.jobUrl);
  const salaryMin = parseSalary(values.salaryMin);
  const salaryMax = parseSalary(values.salaryMax);
  const requirementsMustHave = splitRequirementLines(
    values.requirementsMustHave
  );
  const requirementsNiceToHave = splitRequirementLines(
    values.requirementsNiceToHave
  );

  return {
    company: values.company,
    job_title: values.jobTitle,
    job_description: values.jobDescription || undefined,
    job_url: normalizedUrl || undefined,
    status_id: values.statusId,
    applied_at: values.appliedAt,
    salary_min: salaryMin ?? undefined,
    salary_max: salaryMax ?? undefined,
    salary_currency: values.salaryCurrency,
    recruiter_name: values.recruiterName || undefined,
    recruiter_title: values.recruiterTitle || undefined,
    recruiter_linkedin_url: values.recruiterLinkedinUrl || undefined,
    requirements_must_have: requirementsMustHave ?? undefined,
    requirements_nice_to_have: requirementsNiceToHave ?? undefined,
    source: values.source || undefined,
  };
}

export function buildUpdateApplicationPayload(
  values: ApplicationModalFormValues
): ApplicationUpdate {
  const normalizedUrl = normalizeApplicationUrl(values.jobUrl);

  return {
    company: values.company,
    job_title: values.jobTitle,
    job_description: values.jobDescription || null,
    job_url: normalizedUrl || null,
    status_id: values.statusId,
    applied_at: values.appliedAt,
    salary_min: parseSalary(values.salaryMin),
    salary_max: parseSalary(values.salaryMax),
    salary_currency: values.salaryCurrency || null,
    recruiter_name: values.recruiterName || null,
    recruiter_title: values.recruiterTitle || null,
    recruiter_linkedin_url: values.recruiterLinkedinUrl || null,
    requirements_must_have: splitRequirementLines(values.requirementsMustHave),
    requirements_nice_to_have: splitRequirementLines(
      values.requirementsNiceToHave
    ),
    source: values.source || null,
  };
}

export function getApplicationModalDefaults(
  statuses: Status[]
): ApplicationModalFormValues {
  const defaultStatus =
    statuses.find((status) => status.is_default) || statuses[0];

  return {
    company: '',
    jobTitle: '',
    jobDescription: '',
    jobUrl: '',
    statusId: defaultStatus?.id || '',
    appliedAt: new Date().toISOString().split('T')[0],
    salaryMin: '',
    salaryMax: '',
    salaryCurrency: 'USD',
    recruiterName: '',
    recruiterTitle: '',
    recruiterLinkedinUrl: '',
    requirementsMustHave: '',
    requirementsNiceToHave: '',
    source: '',
  };
}

export function getApplicationModalValues(
  application: Application
): ApplicationModalFormValues {
  return {
    company: application.company,
    jobTitle: application.job_title,
    jobDescription: application.job_description || '',
    jobUrl: application.job_url || '',
    statusId: application.status.id,
    appliedAt: application.applied_at.split('T')[0],
    salaryMin:
      application.salary_min !== null
        ? String(application.salary_min / 1000)
        : '',
    salaryMax:
      application.salary_max !== null
        ? String(application.salary_max / 1000)
        : '',
    salaryCurrency: application.salary_currency || 'USD',
    recruiterName: application.recruiter_name || '',
    recruiterTitle: application.recruiter_title || '',
    recruiterLinkedinUrl: application.recruiter_linkedin_url || '',
    requirementsMustHave: application.requirements_must_have?.join('\n') || '',
    requirementsNiceToHave:
      application.requirements_nice_to_have?.join('\n') || '',
    source: application.source || '',
  };
}
