import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Profile from './Profile';
import { apiV030, type Profile as ProfileData } from '@/lib/apiV030';
import i18n from '@/lib/i18n';
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ refreshUser: vi.fn() }),
}));
vi.mock('@/lib/apiV030', () => ({
  apiV030: { profile: vi.fn(), updateProfile: vi.fn() },
}));
let profile: ProfileData;
beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage('en');
  profile = {
    id: 'profile',
    user_id: 'owner',
    revision: 7,
    permission_revision: 2,
    ai_permissions: { excluded: false },
    display_name: 'Mila',
    first_name: null,
    last_name: null,
    email: 'mila@example.com',
    phone: null,
    location: null,
    city: 'Belgrade',
    country: 'Serbia',
    linkedin_url: null,
    desired_positions: ['Backend Engineer'],
    fields_of_work: [],
    seniority: 'junior',
    work_modes: ['remote'],
    employment_types: ['full_time'],
    years_experience: 1,
    authorized_to_work: null,
    requires_sponsorship: null,
    location_restrictions: null,
    work_history: [],
    projects: [
      {
        id: 'excluded',
        name: 'Private project',
        kind: 'personal',
        description: 'A private tool',
        technologies: ['Python'],
      },
    ],
    education: [],
    certificates: [],
    languages: [],
    technologies: [{ id: 'python', name: 'Python' }],
    skill_items: [],
    skills: [],
  };
  vi.mocked(apiV030.profile).mockImplementation(async () =>
    structuredClone(profile)
  );
  vi.mocked(apiV030.updateProfile).mockImplementation(async (data) => {
    profile = {
      ...profile,
      ...data,
      revision: profile.revision + 1,
    } as ProfileData;
    return structuredClone(profile);
  });
});
afterEach(cleanup);
async function open() {
  render(<Profile />);
  await screen.findByRole('heading', { name: 'Mila' });
}
function card(name: string) {
  return screen.getByRole('heading', { name }).closest('section')!;
}
it('shows all nine sections and never offers a personal AI switch', async () => {
  await open();
  for (const name of [
    'Personal details',
    'Job preferences',
    'Work authorization',
    'Skills & technologies',
    'Work experience',
    'Projects',
    'Education',
    'Certificates',
    'Languages',
  ])
    expect(screen.getByRole('heading', { name })).toBeVisible();
  expect(
    within(card('Personal details')).queryByRole('switch')
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole('switch')).toHaveLength(8);
  expect(apiV030.updateProfile).not.toHaveBeenCalled();
});
it('edits a section inline and keeps permissions with a revision guard', async () => {
  await open();
  fireEvent.click(
    within(card('Personal details')).getByRole('button', { name: 'Edit' })
  );
  fireEvent.change(screen.getByLabelText('Display name'), {
    target: { value: 'Mila Jović' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('heading', { name: 'Mila Jović' });
  expect(apiV030.updateProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      expected_revision: 7,
      display_name: 'Mila Jović',
    })
  );
  expect(profile.ai_permissions.excluded).toBe(false);
});
it('edits an entry in a modal without resetting its excluded permission', async () => {
  await open();
  fireEvent.click(
    within(card('Projects')).getAllByRole('button', { name: 'Edit' })[1]
  );
  const dialog = screen.getByRole('dialog', { name: 'Edit project' });
  expect(
    within(dialog).getByRole('checkbox', { name: 'AI may use this item' })
  ).not.toBeChecked();
  fireEvent.change(within(dialog).getByLabelText('Name'), {
    target: { value: 'Renamed private project' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await screen.findByText(/Renamed private project/);
  expect(profile.projects[0].id).toBe('excluded');
  expect(profile.ai_permissions.excluded).toBe(false);
});
it('edits an entry section in place and retains stable IDs and permissions', async () => {
  await open();
  fireEvent.click(
    within(card('Projects')).getAllByRole('button', { name: 'Edit' })[0]
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Inline project' },
  });
  fireEvent.click(
    within(card('Projects')).getByRole('button', { name: 'Save' })
  );
  await screen.findByText(/Inline project/);
  expect(profile.projects[0].id).toBe('excluded');
  expect(profile.ai_permissions.excluded).toBe(false);
  expect(apiV030.updateProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      expected_revision: 7,
      projects: [
        expect.objectContaining({ id: 'excluded', name: 'Inline project' }),
      ],
    })
  );
});
it('reviews the first excluded entry', async () => {
  await open();
  const scroll = vi.fn();
  document.getElementById('excluded')!.scrollIntoView = scroll;
  fireEvent.click(
    screen.getByRole('button', { name: 'Review excluded items' })
  );
  expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
});
it('adds a stable-ID entry allowed by default and does not run AI', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: /Add language/ }));
  const dialog = screen.getByRole('dialog', { name: 'Add language' });
  fireEvent.change(within(dialog).getByLabelText('Name'), {
    target: { value: 'English' },
  });
  expect(
    within(dialog).getByRole('checkbox', { name: 'AI may use this item' })
  ).toBeChecked();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await screen.findByText('English');
  expect(profile.languages[0].id).toMatch(/^[a-f0-9-]{36}$/);
  expect(profile.ai_permissions[profile.languages[0].id]).toBe(true);
});
it('disables item checkboxes when the section is not allowed', async () => {
  await open();
  fireEvent.click(within(card('Projects')).getByRole('switch'));
  await waitFor(() =>
    expect(
      within(card('Projects')).getByRole('checkbox', { name: 'AI' })
    ).toBeDisabled()
  );
  expect(apiV030.updateProfile).toHaveBeenCalledWith({
    expected_revision: 7,
    ai_permissions: { excluded: false, projects: false },
  });
});
it('keeps an unsaved entry on conflicts and lets the user reload before saving', async () => {
  await open();
  vi.mocked(apiV030.updateProfile).mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 409 },
  });
  fireEvent.click(screen.getByRole('button', { name: /Add project/ }));
  const dialog = screen.getByRole('dialog', { name: 'Add project' });
  fireEvent.change(within(dialog).getByLabelText('Name'), {
    target: { value: 'Unsaved project' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Your profile changed elsewhere'
  );
  expect(within(dialog).getByLabelText('Name')).toHaveValue('Unsaved project');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reload' }));
  await waitFor(() =>
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  );
  expect(within(dialog).getByLabelText('Name')).toHaveValue('Unsaved project');
});
it('confirms deletion and saves only the owning profile item list', async () => {
  await open();
  fireEvent.click(
    within(card('Projects')).getByRole('button', { name: 'Delete' })
  );
  expect(apiV030.updateProfile).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Delete item' })).getByRole(
      'button',
      { name: 'Delete' }
    )
  );
  await waitFor(() =>
    expect(screen.queryByText(/Private project/)).not.toBeInTheDocument()
  );
  expect(apiV030.updateProfile).toHaveBeenCalledWith({
    expected_revision: 7,
    projects: [],
  });
});
it('offers the profile edit action for an empty profile', async () => {
  profile = {
    ...profile,
    display_name: null,
    desired_positions: [],
    seniority: null,
    work_modes: [],
    employment_types: [],
    years_experience: null,
    projects: [],
    technologies: [],
  };
  render(<Profile />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  expect(screen.getByLabelText('Display name')).toBeVisible();
});
