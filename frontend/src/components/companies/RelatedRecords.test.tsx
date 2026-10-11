import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { RelatedApplications } from './RelatedRecords';
import type { ApplicationRecord } from '@/lib/apiV030';
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
afterEach(cleanup);
it('keeps a long saved status inside company and contact application rows', () => {
  const name = 'W'.repeat(180);
  render(
    <MemoryRouter>
      <RelatedApplications
        items={[
          {
            id: 'one',
            job_title: 'Role',
            applied_at: null,
            status: { name, color: '#123456' },
          } as ApplicationRecord,
        ]}
      />
    </MemoryRouter>
  );
  expect(screen.getByText('● ' + name)).toHaveClass(
    'min-w-0',
    'max-w-full',
    '[overflow-wrap:anywhere]'
  );
});
