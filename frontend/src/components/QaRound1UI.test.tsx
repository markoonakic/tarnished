import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HelpTip from './HelpTip';
import Modal from './Modal';
import NotesPanel from './NotesPanel';
import FeatureToggles from './settings/FeatureToggles';
import SettingsAPIKey from './settings/SettingsAPIKey';
import CreateUserModal from './CreateUserModal';
import InterviewParticipants from './InterviewParticipants';
import Companies from '@/pages/Companies';
import i18n from '@/lib/i18n';

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: {
      show_streak_stats: true,
      show_needs_attention: true,
      show_heatmap: true,
    },
  }),
  useUpdateUserPreferences: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));
vi.mock('@/lib/settings', () => ({
  listAPIKeys: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/apiV030', () => ({
  apiV030: {
    companies: vi.fn().mockRejectedValue(new Error('Picker unavailable')),
    contacts: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'contact',
          name: 'Linked person',
          company_id: 'company',
          company_name: 'Linked company',
        },
      ],
      total: 1,
    }),
  },
}));
const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await i18n.changeLanguage('en');
});

it('help overlays cannot intercept clicks on adjacent form actions', () => {
  render(
    <>
      <HelpTip label="Help">Supported files</HelpTip>
      <button>Edit transcript</button>
    </>
  );
  fireEvent.mouseEnter(
    screen.getByRole('button', { name: 'Help' }).parentElement!
  );
  expect(screen.getByRole('tooltip')).toHaveClass('pointer-events-none');
  expect(screen.getByRole('button', { name: 'Edit transcript' })).toBeEnabled();
});
it('initial modal focus does not open a help tip over the file chooser', () => {
  render(
    <Modal onClose={vi.fn()} label="Import">
      <HelpTip label="Import help">Import guidance</HelpTip>
      <button>Choose ZIP archive</button>
    </Modal>
  );
  expect(
    screen.getByRole('button', { name: 'Choose ZIP archive' })
  ).toHaveFocus();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('keeps a pending note draft and blocks reload until the save ends', async () => {
  let complete!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  render(<NotesPanel notes={[]} onAdd={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Pending note' },
  });
  fireEvent.keyDown(screen.getByRole('textbox'), {
    key: 'Enter',
    ctrlKey: true,
  });
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(screen.getByRole('textbox')).toHaveValue('Pending note');
  complete();
  await waitFor(() =>
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  );
  const done = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(done);
  expect(done.defaultPrevented).toBe(false);
});
it.each(['en', 'sr-Latn'])(
  'keeps Features, API Keys and Create User explanations in closed HelpTips in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    const view = render(
      <MemoryRouter>
        <FeatureToggles />
        <SettingsAPIKey />
        <CreateUserModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(view.container.querySelector('[role="status"]')).toBeNull()
    );
    const keys = [
      'Choose which optional dashboard and analytics sections stay visible.',
      'Display the Flame of Ambition widget on the dashboard.',
      'Display follow-up sections on the dashboard.',
      'Display the activity heatmap on the dashboard and analytics page.',
      'Create a separate API key for each CLI profile or browser extension. Keys are shown in full only once when created.',
      'Password resets invalidate all browser sessions and signed links, not API keys.',
    ];
    for (const key of keys)
      expect(screen.queryByText(i18n.t(key))).not.toBeInTheDocument();
  }
);
it('gives the round participant selector the same field surface as adjacent inputs', async () => {
  render(
    <QueryClientProvider client={client()}>
      <InterviewParticipants
        value={[]}
        onChange={vi.fn()}
        containerBackground="bg2"
      />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByRole('combobox').parentElement).toHaveClass('bg-bg3');
});
it('shows saved contact company names without waiting for the independent company picker', async () => {
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={['/contacts']}>
        <Companies />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const links = await screen.findAllByRole('link', { name: 'Linked company' });
  expect(links.length).toBeGreaterThan(0);
  for (const link of links)
    expect(link).toHaveAttribute('href', '/companies/company');
});
