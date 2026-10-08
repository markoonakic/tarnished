vi.mock('@/hooks/useEffectiveDayKey', () => ({ useEffectiveDayKey: () => '2026-10-08' }));
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import ApplicationDetail from './ApplicationDetail';
import type { Application } from '../lib/types';

const { getApplication, toast } = vi.hoisted(() => ({
  getApplication: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('../lib/applications', () => ({
  getApplication,
  deleteApplication: vi.fn(),
}));
vi.mock('../contexts/ToastContext', () => ({ useToastContext: () => toast }));
vi.mock('../hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('../components/slots/ApplicationReminders', () => ({
  default: () => null,
}));
vi.mock('../components/slots/LeadReminders', () => ({ default: () => null }));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../components/DocumentSection', () => ({ default: () => null }));
vi.mock('../components/application/HistoryViewer', () => ({
  default: () => null,
}));
vi.mock('../components/ApplicationModal', () => ({ default: () => null }));
afterEach(cleanup);

it.each([0, null])(
  'distinguishes a saved zero salary from absent bounds: %s',
  async (amount) => {
    const application = {
      id: 'app',
      company: 'Salary fixture',
      job_title: 'Trainee',
      status: {
        id: 'status',
        name: 'Applied',
        meaning: 'applied',
        color: '#abc',
      },
      status_meaning: 'applied',
      status_meaning_provenance: 'recorded',
      evidence_revision: 1,
      response_state: 'not_recorded',
      response_occurred_on: null,
      response_recorded_at: null,
      response_reference: null,
      applied_at: '2026-09-15',
      created_at: '2026-09-15T10:00:00Z',
      updated_at: '2026-09-15T10:00:00Z',
      salary_min: amount,
      salary_max: amount,
      salary_currency: 'EUR',
      location: null,
      recruiter_name: null,
      recruiter_title: null,
      recruiter_linkedin_url: null,
      years_experience_min: null,
      years_experience_max: null,
      requirements_must_have: [],
      requirements_nice_to_have: [],
      skills: [],
      source: null,
      job_description: null,
      job_url: null,
      cv_path: null,
      cover_letter_path: null,
      job_lead_id: null,
      rounds: [],
    } satisfies Application;
    getApplication.mockResolvedValue(application);
    render(
      <MemoryRouter initialEntries={['/applications/app']}>
        <Routes>
          <Route path="/applications/:id" element={<ApplicationDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('heading', { name: 'Salary fixture' });
    if (amount === 0) {
      expect(
        screen.getByRole('heading', { name: 'Salary Range' })
      ).toBeVisible();
      expect(screen.getByText('EUR 0 - 0')).toBeVisible();
    } else
      expect(
        screen.queryByRole('heading', { name: 'Salary Range' })
      ).not.toBeInTheDocument();
  }
);
