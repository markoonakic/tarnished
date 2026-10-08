import { t } from './i18n';

const statusKeys = {
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  no_reply: 'No Reply',
} as const;
const roundKeys = {
  phone_screen: 'Phone Screen',
  technical: 'Technical',
  behavioral: 'Behavioral',
  take_home: 'Take-home',
  onsite: 'Onsite',
  final: 'Final',
} as const;

type Reference = { name: string; builtin_key?: string | null };
export function statusLabel(value: Reference): string {
  const key = value.builtin_key;
  return key && Object.hasOwn(statusKeys, key)
    ? t(statusKeys[key as keyof typeof statusKeys])
    : value.name;
}
export function roundTypeLabel(value: Reference): string {
  const key = value.builtin_key;
  return key && Object.hasOwn(roundKeys, key)
    ? t(roundKeys[key as keyof typeof roundKeys])
    : value.name;
}
