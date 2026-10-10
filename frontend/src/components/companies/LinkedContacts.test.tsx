import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
import LinkedContacts from './LinkedContacts';
const { contacts, applicationContacts, setApplicationContacts, updateLead } =
  vi.hoisted(() => ({
    contacts: vi.fn(),
    applicationContacts: vi.fn(),
    setApplicationContacts: vi.fn(),
    updateLead: vi.fn(),
  }));
vi.mock('@/lib/apiV030', () => ({
  apiV030: {
    contacts,
    applicationContacts,
    setApplicationContacts,
    updateLead,
  },
}));
vi.mock('./RecordModals', () => ({ ContactModal: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  contacts.mockResolvedValue({
    items: [{ id: 'contact', name: 'Linked person' }],
    total: 1,
  });
  applicationContacts.mockResolvedValue({ contact_ids: [], revision: 4 });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

it.each(['application', 'lead'] as const)(
  'guards pending %s contact writes until the relationship is saved',
  async (kind) => {
    let release!: () => void;
    const save = kind === 'application' ? setApplicationContacts : updateLead;
    save.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      applicationContacts.mockResolvedValue({
        contact_ids: ['contact'],
        revision: 5,
      });
    });
    render(
      <MemoryRouter>
        <LinkedContacts id="record" kind={kind} revision={4} />
      </MemoryRouter>
    );
    const link = await screen.findByRole('button', { name: 'Link contact' });
    await waitFor(() => expect(link).toBeEnabled());
    fireEvent.click(link);
    const field = screen.getByRole('combobox', { name: 'Link contact' });
    fireEvent.focus(field);
    fireEvent.click(
      await screen.findByRole('option', { name: 'Linked person' })
    );
    await waitFor(() => expect(release).toBeTypeOf('function'));
    const leaving = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leaving()).toBe(true);
    expect(field).toBeDisabled();
    release();
    await waitFor(() => expect(leaving()).toBe(false));
    expect(save).toHaveBeenCalledWith(
      'record',
      kind === 'application'
        ? { contact_ids: ['contact'], expected_revision: 4 }
        : { recruiter_contact_id: 'contact', expected_revision: 4 }
    );
  }
);
