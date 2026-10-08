import { t, locale } from '@/lib/i18n';
import type { JobLead } from './types';

export function getJobLeadStatusBadgeClass(status: JobLead['status']): string {
  const colors = {
    pending: 'bg-yellow-bright/20 text-yellow-bright',
    processing: 'bg-yellow-bright/20 text-yellow-bright',
    extracted: 'bg-green-bright/20 text-green-bright',
    failed: 'bg-red-bright/20 text-red-bright',
    converted: 'bg-blue-bright/20 text-blue-bright',
  } satisfies Record<JobLead['status'], string>;

  return colors[status];
}

export function getJobLeadStatusLabel(status: JobLead['status']): string {
  const labels = { pending: 'Saved', processing: 'Processing', extracted: 'Extracted', failed: 'Failed', converted: 'Converted' } as const;
  return t(labels[status]);
}

export function formatSalaryRange(
  currency: string | null,
  salaryMin: number | null,
  salaryMax: number | null
): string {
  return `${currency || 'USD'} ${salaryMin?.toLocaleString(locale()) || '???'} - ${salaryMax?.toLocaleString(locale()) || '???'}`;
}

export function formatExperienceRange(
  yearsMin: number | null,
  yearsMax: number | null
): string {
  return t('{{value0}}-{{value1}} years', {
    value0: yearsMin ?? '?',
    value1: yearsMax ?? '?',
  });
}
