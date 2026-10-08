import type { CSSProperties } from 'react';
export const reminderKinds = {
  application_deadline: { icon: 'bi-calendar-x', color: '--red-bright' },
  reply_to_company: { icon: 'bi-reply', color: '--blue-bright' },
  interview: { icon: 'bi-people', color: '--orange-bright' },
  interview_preparation: { icon: 'bi-book', color: '--yellow-bright' },
  task_submission: { icon: 'bi-upload', color: '--purple-bright' },
  recruiter_follow_up: { icon: 'bi-bell', color: '--aqua-bright' },
  expected_feedback: { icon: 'bi-hourglass-split', color: '--gray' },
} as const;
export type ReminderKind = keyof typeof reminderKinds;
export function pillStyle(color: string): CSSProperties {
  return {
    color: `var(${color})`,
    background: `color-mix(in srgb,var(${color}) 14%,transparent)`,
  };
}
