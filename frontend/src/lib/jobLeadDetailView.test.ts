import { describe, expect, it } from 'vitest';

import {
  formatExperienceRange,
  formatSalaryRange,
  getJobLeadStatusBadgeClass,
} from './jobLeadDetailView';

describe('job lead detail view helpers', () => {
  it('maps job lead statuses to badge classes', () => {
    expect(getJobLeadStatusBadgeClass('failed')).toBe(
      'bg-red-bright/20 text-red-bright'
    );
    expect(getJobLeadStatusBadgeClass('converted')).toBe(
      'bg-blue-bright/20 text-blue-bright'
    );
  });

  it('formats salary ranges with fallbacks for missing bounds', () => {
    expect(formatSalaryRange('EUR', 100_000, null)).toBe('EUR 100,000 - ???');
    expect(formatSalaryRange(null, null, 150_000)).toBe('USD ??? - 150,000');
  });

  it('formats experience ranges with placeholders for missing values', () => {
    expect(formatExperienceRange(2, 5)).toBe('2-5 years');
    expect(formatExperienceRange(null, 5)).toBe('?-5 years');
  });
});
