import { apiV030, type Company, type JobFields } from './apiV030';

export const workModes = ['office', 'hybrid', 'remote', 'other'] as const;
export const employmentTypes = [
  'full_time',
  'part_time',
  'contract',
  'internship',
  'temporary',
  'other',
] as const;
export const priorities = ['low', 'normal', 'high'] as const;
export const payPeriods = [
  'hour',
  'day',
  'week',
  'month',
  'year',
  'other',
] as const;
export const recordInput =
  'bg-bg2 text-fg1 focus:ring-accent mt-1 w-full rounded px-3 py-2 text-sm outline-none focus:ring-2';
export const recordAction =
  'text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer rounded px-3 py-1.5 text-sm focus:ring-2 disabled:opacity-50';

export async function recordCompanies(): Promise<Company[]> {
  const companies: Company[] = [];
  for (let page = 1; ; page++) {
    const data = await apiV030.companies({ page, per_page: 100 });
    companies.push(...data.items);
    if (!data.items.length || companies.length >= data.total) return companies;
  }
}

export function jobMetadata(value: JobFields = {}): JobFields {
  return {
    work_mode: value.work_mode || null,
    employment_type: value.employment_type || null,
    seniority: value.seniority || null,
    deadline: value.deadline || null,
    pay_period: value.pay_period || null,
    priority: value.priority || 'normal',
    tags: value.tags || [],
    company_id: value.company_id || null,
  };
}
