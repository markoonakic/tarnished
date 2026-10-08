import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n, { t } from '@/lib/i18n';
import Layout from './Layout';

const auth = vi.hoisted(() => ({
  user: { display_name: 'Marko', email: 'marko@example.com', is_admin: true },
  signOut: vi.fn(),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
beforeEach(() => {
  auth.user = {
    display_name: 'Marko',
    email: 'marko@example.com',
    is_admin: true,
  };
  auth.signOut.mockClear();
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

it.each(['en', 'sr-Latn'])(
  'shows the account links in order and restores focus on Escape in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    render(
      <MemoryRouter>
        <Layout>
          <p>Page</p>
        </Layout>
      </MemoryRouter>
    );
    const account = screen.getByRole('button', { name: 'Marko' });
    fireEvent.click(account);
    const menu = screen.getByLabelText(t('Account menu'));
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
    ).toEqual(['/profile', '/settings', '/admin']);
    expect(
      within(menu).getByRole('link', { name: t('Profile') })
    ).toBeInTheDocument();
    within(menu)
      .getByRole('link', { name: t('Profile') })
      .focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText(t('Account menu'))).not.toBeInTheDocument();
    expect(account).toHaveFocus();
  }
);

it('uses the email fallback and keeps the same account links on mobile without Admin for non-admins', () => {
  auth.user.display_name = '';
  auth.user.is_admin = false;
  render(
    <MemoryRouter>
      <Layout>
        <p>Page</p>
      </Layout>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));
  const mobile = document.getElementById('mobile-navigation')!;
  expect(within(mobile).getByText('marko@example.com')).toBeInTheDocument();
  expect(within(mobile).getByRole('link', { name: 'Profile' })).toHaveAttribute(
    'href',
    '/profile'
  );
  expect(
    within(mobile).queryByRole('link', { name: 'Admin' })
  ).not.toBeInTheDocument();
  fireEvent.click(within(mobile).getByRole('button', { name: 'Sign out' }));
  expect(auth.signOut).toHaveBeenCalledOnce();
});
