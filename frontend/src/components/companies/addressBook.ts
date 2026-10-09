import { formatDate } from '@/lib/displayDate';
import { isAxiosError } from 'axios';
import { apiV030, type Page, type Company, type Contact } from '@/lib/apiV030';
import { errorMessage } from '@/lib/errorMessage';
import { t } from '@/lib/i18n';

export const inputClass =
  'bg-bg2 text-fg1 placeholder:text-fg4 focus:ring-accent w-full rounded px-3 py-2 outline-none focus:ring-2';
export const actionClass =
  'text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer rounded px-3 py-1.5 text-sm focus:ring-2 disabled:opacity-50';
export const primaryClass =
  'bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent cursor-pointer rounded px-4 py-2 font-medium focus:ring-2 disabled:opacity-50';
export const roles = [
  'Recruiter',
  'Hiring manager',
  'Interviewer',
  'Team member',
  'HR',
  'Referral',
  'Other',
];
export const roleLabel = (role?: string | null) =>
  role ? (roles.includes(role) ? t('companies.role.' + role) : role) : '';
export const roleColor = (role?: string | null) =>
  role === 'Hiring manager'
    ? '--purple-bright'
    : role === 'Interviewer'
      ? '--orange-bright'
      : '--aqua-bright';
export const dateLabel = formatDate;
export const failureMessage = (error: unknown) =>
  isAxiosError(error)
    ? errorMessage(error.response?.data, error.response?.status)
    : t('companies.failed');
export async function allPages<T>(
  load: (page: number) => Promise<Page<T>>
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const result = await load(page);
    items.push(...result.items);
    if (items.length >= result.total || !result.items.length) return items;
  }
}
export const allCompanies = (): Promise<Company[]> =>
  allPages((page) => apiV030.companies({ page, per_page: 100 }));
export const allContacts = (): Promise<Contact[]> =>
  allPages((page) => apiV030.contacts({ page, per_page: 100 }));
