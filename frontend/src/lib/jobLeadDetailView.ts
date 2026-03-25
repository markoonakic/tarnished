import type { JobLead } from './types';

export function getJobLeadStatusBadgeClass(status: JobLead['status']): string {
  const colors = {
    pending: 'bg-yellow-bright/20 text-yellow-bright',
    extracted: 'bg-green-bright/20 text-green-bright',
    failed: 'bg-red-bright/20 text-red-bright',
    converted: 'bg-blue-bright/20 text-blue-bright',
  } satisfies Record<JobLead['status'], string>;

  return colors[status];
}

export function formatSalaryRange(
  currency: string | null,
  salaryMin: number | null,
  salaryMax: number | null
): string {
  return `${currency || 'USD'} ${salaryMin?.toLocaleString() || '???'} - ${salaryMax?.toLocaleString() || '???'}`;
}

export function formatExperienceRange(
  yearsMin: number | null,
  yearsMax: number | null
): string {
  return `${yearsMin ?? '?'}-${yearsMax ?? '?'} years`;
}
