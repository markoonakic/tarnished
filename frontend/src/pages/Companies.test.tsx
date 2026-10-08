import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiV030, type Company, type Contact } from '@/lib/apiV030';
import { queryClient } from '@/lib/queryClient';
import i18n from '@/lib/i18n';
import Companies from './Companies';
import CompanyDetail from './CompanyDetail';
import ContactDetail from './ContactDetail';
import CompanyPicker from '@/components/CompanyPicker';
import TargetNotes from '@/components/TargetNotes';
import LinkedContacts from '@/components/companies/LinkedContacts';
import {
  CompanyModal,
  ContactModal,
} from '@/components/companies/RecordModals';
import en from '@/locales/areas/companies.en.json';
import sr from '@/locales/areas/companies.sr-Latn.json';
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: { time_zone_mode: 'manual', time_zone: 'Europe/Belgrade' },
  }),
}));
const company: Company = {
  id: 'company',
  user_id: 'owner',
  name: 'Orbis Ledger',
  industry: 'Fintech',
  location: 'Belgrade',
  size: '51-200',
  description: 'Billing tools.',
  culture_notes: 'Quick replies.',
  revision: 4,
  created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-10-08T09:00:00Z',
  lead_count: 3,
  application_count: 5,
};
const contact: Contact = {
  id: 'contact',
  user_id: 'owner',
  name: 'Ana Ristić',
  function: 'Talent Partner',
  company_id: company.id,
  role: 'Recruiter',
  email: 'ana@example.com',
  phone: '+38111000',
  revision: 2,
  created_at: company.created_at,
  updated_at: company.updated_at,
};
const page = <T,>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  per_page: 25,
});
function show(ui: React.ReactNode, path = '/companies') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(async () => {
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  await i18n.changeLanguage('en');
  vi.spyOn(apiV030, 'companies').mockResolvedValue(page([company]));
  vi.spyOn(apiV030, 'contacts').mockResolvedValue(page([contact]));
  vi.spyOn(apiV030, 'company').mockResolvedValue({
    ...company,
    contacts: [contact],
    leads: [],
    applications: [],
  });
  vi.spyOn(apiV030, 'contact').mockResolvedValue({
    ...contact,
    company,
    applications: [],
    rounds: [],
  });
  vi.spyOn(apiV030, 'notes').mockResolvedValue(page([]));
  vi.spyOn(apiV030, 'reminders').mockResolvedValue(page([]));
  vi.spyOn(apiV030, 'applicationContacts').mockResolvedValue({
    contact_ids: [contact.id],
    revision: 7,
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
});
it('keeps every area string in both languages', () => {
  expect(Object.keys(sr).sort()).toEqual(Object.keys(en).sort());
  expect(Object.values(sr).every((value) => value.trim())).toBe(true);
});
it('renders company counts and filters on the URL, then switches to contacts', async () => {
  show(<Companies />);
  await screen.findAllByRole('link', { name: company.name });
  expect(screen.getAllByText('Fintech')[0]).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search companies…' }), {
    target: { value: 'Orbis' },
  });
  await waitFor(() =>
    expect(apiV030.companies).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Orbis', sort: 'activity' })
    )
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Contacts' }));
  await screen.findAllByRole('link', { name: contact.name });
  expect(screen.getAllByText('Recruiter')[0]).toBeInTheDocument();
  expect(
    screen.getAllByRole('link', { name: contact.email! })[0]
  ).toHaveAttribute('href', 'mailto:' + contact.email);
});
it('opens create forms from the list and saves a selected company', async () => {
  const create = vi.spyOn(apiV030, 'createContact').mockResolvedValue(contact);
  show(
    <ContactModal
      companyId={company.id}
      companyName={company.name}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />
  );
  fireEvent.change(screen.getByLabelText('Name', { exact: false }), {
    target: { value: contact.name },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: contact.name,
        company_id: company.id,
        last_contact_on: null,
      })
    )
  );
});
it('keeps a company draft after a failed save and sends its frozen revision', async () => {
  const save = vi
    .spyOn(apiV030, 'updateCompany')
    .mockRejectedValue(new Error('Conflict'));
  show(<CompanyModal company={company} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Name', { exact: false }), {
    target: { value: 'Orbis Two' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Name', { exact: false })).toHaveValue(
    'Orbis Two'
  );
  expect(save).toHaveBeenCalledWith(
    company.id,
    expect.objectContaining({ name: 'Orbis Two', expected_revision: 4 })
  );
});
it('creates a company from the picker and keeps the parent form open', async () => {
  const change = vi.fn();
  vi.spyOn(apiV030, 'createCompany').mockResolvedValue({
    ...company,
    name: 'New Company',
  });
  show(<CompanyPicker onChange={change} />);
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'New Company' } });
  fireEvent.click(
    await screen.findByRole('option', { name: '+ Create "New Company"' })
  );
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith(company.id, 'New Company')
  );
});
it('shows company relations, culture, notes and delete counts', async () => {
  show(
    <Routes>
      <Route path="/companies/:id" element={<CompanyDetail />} />
    </Routes>,
    '/companies/company'
  );
  await screen.findByRole('heading', { name: company.name });
  expect(screen.getByText('Quick replies.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: contact.name })).toHaveAttribute(
    'href',
    '/contacts/contact'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(
    screen.getByText(/3 job leads and 5 applications will keep/)
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
});
it('shows contact information and its company link', async () => {
  show(
    <Routes>
      <Route path="/contacts/:id" element={<ContactDetail />} />
    </Routes>,
    '/contacts/contact'
  );
  await screen.findByRole('heading', { name: contact.name });
  expect(screen.getByRole('link', { name: company.name })).toHaveAttribute(
    'href',
    '/companies/company'
  );
  expect(screen.getByRole('link', { name: contact.email! })).toHaveAttribute(
    'href',
    'mailto:' + contact.email
  );
  expect(screen.getByRole('link', { name: contact.phone! })).toHaveAttribute(
    'href',
    'tel:' + contact.phone
  );
});
it('adds, edits and deletes owner-targeted notes with revisions', async () => {
  const note = {
    id: 'note',
    user_id: 'owner',
    company_id: company.id,
    body: 'Saved note',
    revision: 3,
    created_at: company.created_at,
    updated_at: company.updated_at,
  };
  vi.mocked(apiV030.notes).mockResolvedValue(page([note]));
  const add = vi.spyOn(apiV030, 'createNote').mockResolvedValue(note);
  const edit = vi.spyOn(apiV030, 'updateNote').mockResolvedValue(note);
  const remove = vi.spyOn(apiV030, 'deleteNote').mockResolvedValue();
  show(<TargetNotes targetType="company" targetId={company.id} />);
  await screen.findByText('Saved note');
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
    target: { value: 'New note' },
  });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Note' }), {
    key: 'Enter',
    ctrlKey: true,
  });
  await waitFor(() =>
    expect(add).toHaveBeenCalledWith({
      body: 'New note',
      company_id: company.id,
    })
  );
  await waitFor(() =>
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
    target: { value: 'Changed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(edit).toHaveBeenCalledWith('note', {
      body: 'Changed',
      expected_revision: 3,
    })
  );
  await waitFor(() =>
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })
  );
  await waitFor(() => expect(remove).toHaveBeenCalledWith('note', 3));
});
it('unlinks an application contact without deleting the contact and uses the link revision', async () => {
  const save = vi
    .spyOn(apiV030, 'setApplicationContacts')
    .mockResolvedValue({ contact_ids: [], revision: 8 });
  show(
    <LinkedContacts
      kind="application"
      id="application"
      companyId={company.id}
      revision={6}
    />
  );
  await screen.findByRole('link', { name: contact.name });
  fireEvent.click(screen.getByRole('button', { name: 'Unlink Ana Ristić' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith('application', {
      contact_ids: [],
      expected_revision: 7,
    })
  );
});
