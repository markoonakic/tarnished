import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, { dictionaries, t } from '@/lib/i18n';
import en from '@/locales/areas/kit.en.json';
import sr from '@/locales/areas/kit.sr-Latn.json';
import { reminderKinds } from '@/lib/uiPills';
import Card from './Card';
import CollapsibleCard from './CollapsibleCard';
import SegmentedControl from './SegmentedControl';
import TagInput from './TagInput';
import AiToggle from './AiToggle';
import AiCheckbox from './AiCheckbox';
import KindPill from './KindPill';
import ResultPill from './ResultPill';
import NotesPanel from './NotesPanel';
import RemindersCard, { type ReminderItem } from './RemindersCard';
import ReminderModal from './ReminderModal';
import StatusChangeDialog from './StatusChangeDialog';
import SearchableCombobox from './SearchableCombobox';
import ContactRow from './ContactRow';
import EntryRow from './EntryRow';
import TasksBadge from './TasksBadge';
import MonthGrid from './MonthGrid';
beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

it('loads area files and keeps complete English and Serbian keys', async () => {
  expect(Object.keys(sr).sort()).toEqual(Object.keys(en).sort());
  expect(Object.keys(dictionaries.en).sort()).toEqual(
    Object.keys(dictionaries['sr-Latn']).sort()
  );
  for (const key of Object.keys(en)) {
    expect(dictionaries.en[key]).toBe(en[key as keyof typeof en]);
    expect(sr[key as keyof typeof sr].trim()).not.toBe('');
  }
  await i18n.changeLanguage('sr-Latn');
  expect(t('kit.notes')).toBe('Beleške');
  expect(t('Applications')).toBe('Prijave');
});
it('renders the shared header icon, count and action', () => {
  render(
    <Card
      title="Contacts"
      icon="bi-person"
      count={2}
      actions={<button>Add</button>}
    >
      Body
    </Card>
  );
  expect(screen.getByRole('heading', { name: 'Contacts' })).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
});
it('selects a segment with native keyboard radio semantics', () => {
  const onChange = vi.fn();
  render(
    <SegmentedControl
      label="View"
      value="list"
      options={[
        { value: 'list', label: 'List' },
        { value: 'board', label: 'Board' },
        { value: 'disabled', label: 'Disabled', disabled: true },
      ]}
      onChange={onChange}
    />
  );
  expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Board' }));
  expect(onChange).toHaveBeenCalledWith('board');
  expect(screen.getByRole('radio', { name: 'Disabled' })).toBeDisabled();
});
it('collapses content and supports a controlled card', () => {
  const onOpenChange = vi.fn();
  const view = render(
    <CollapsibleCard title="Preparation" defaultOpen={false}>
      Topics
    </CollapsibleCard>
  );
  const button = screen.getByRole('button', { name: 'Preparation' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(button);
  expect(screen.getByText('Topics')).toBeVisible();
  view.rerender(
    <CollapsibleCard
      title="Preparation"
      open={false}
      onOpenChange={onOpenChange}
    >
      Topics
    </CollapsibleCard>
  );
  fireEvent.click(button);
  expect(onOpenChange).toHaveBeenCalledWith(true);
  expect(button).toHaveAttribute('aria-expanded', 'false');
});
it('adds trimmed tags, blocks duplicates and composing input, and removes a tag', () => {
  function Tags() {
    const [value, setValue] = useState(['Python']);
    return <TagInput label="Skills" value={value} onChange={setValue} />;
  }
  render(<Tags />);
  const input = screen.getByRole('textbox', { name: 'Skills' });
  fireEvent.change(input, { target: { value: ' python ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getAllByText('Python')).toHaveLength(1);
  fireEvent.change(input, { target: { value: ' SQL ' } });
  fireEvent.keyDown(input, { key: ',', isComposing: true });
  expect(screen.queryByText('SQL')).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: ',' });
  expect(screen.getByText('SQL')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Python' }));
  expect(screen.queryByText('Python')).not.toBeInTheDocument();
});
it('uses accessible AI switches and disables item checkboxes', () => {
  const toggle = vi.fn();
  render(
    <>
      <AiToggle checked onChange={toggle} />
      <AiCheckbox checked disabled onChange={toggle} />
    </>
  );
  fireEvent.click(screen.getByRole('switch', { name: 'AI' }));
  expect(toggle).toHaveBeenCalledWith(false);
  expect(screen.getByRole('checkbox', { name: 'AI' })).toBeDisabled();
});
it.each(['en', 'sr-Latn'])(
  'renders all seven reminder kinds and all four match results in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    render(
      <>
        {Object.keys(reminderKinds).map((kind) => (
          <KindPill key={kind} kind={kind as keyof typeof reminderKinds} />
        ))}
        {(['confirmed', 'partial', 'no_evidence', 'unknown'] as const).map(
          (result) => (
            <ResultPill key={result} result={result} count={2} />
          )
        )}
      </>
    );
    for (const kind of Object.keys(reminderKinds))
      expect(screen.getByText(t('kit.kind.' + kind))).toBeInTheDocument();
    expect(
      screen.getByText(t('kit.result.confirmed') + ' 2')
    ).toBeInTheDocument();
  }
);

describe('notes', () => {
  const notes = [
    { id: 'old', body: 'Older', created_at: '2026-10-01T09:00:00Z' },
    {
      id: 'new',
      body: 'One\nTwo\nThree\nFour\nFive\nSix\nSeven',
      created_at: '2026-10-08T09:00:00Z',
      updated_at: '2026-10-08T10:00:00Z',
    },
  ];
  it('sorts newest first, expands long text, edits and deletes through callbacks', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <NotesPanel notes={notes} onEdit={onEdit} onDelete={onDelete} />
    );
    expect(container.querySelector('p')).toHaveTextContent('One');
    expect(screen.getByText('One', { exact: false })).toHaveClass(
      'line-clamp-6'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(
      screen.getByRole('button', { name: 'Show less' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit note' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: ' Changed ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('new', 'Changed'));
    await waitFor(() =>
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete note' })[0]);
    expect(onDelete).toHaveBeenCalledWith('new');
  });
  it('adds with Ctrl+Enter and keeps the draft when saving fails', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('private server detail'));
    render(<NotesPanel notes={[]} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    const input = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(input, { target: { value: 'Draft' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Draft'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save.'
    );
    expect(input).toHaveValue('Draft');
    expect(screen.queryByText('private server detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
const reminders: ReminderItem[] = [
  {
    id: 'open',
    title: 'Prepare SQL',
    kind: 'interview_preparation',
    state: 'open',
    due_at: '2026-10-07T09:00:00Z',
  },
  {
    id: 'done',
    title: 'Send reply',
    kind: 'reply_to_company',
    state: 'done',
    due_at: '2026-10-06T09:00:00Z',
  },
  {
    id: 'dismissed',
    title: 'Old reminder',
    kind: 'expected_feedback',
    state: 'dismissed',
    due_at: '2026-10-06T09:00:00Z',
  },
];
it('marks overdue reminders, completes, opens actions and hides done rows initially', () => {
  const onToggle = vi.fn();
  const onEdit = vi.fn();
  const onDismiss = vi.fn();
  const onDelete = vi.fn();
  render(
    <RemindersCard
      reminders={reminders}
      onToggle={onToggle}
      onEdit={onEdit}
      onDismiss={onDismiss}
      onDelete={onDelete}
      now={new Date('2026-10-08T00:00:00Z')}
    />
  );
  expect(screen.getByText(/Overdue/)).toHaveClass('text-red-bright');
  expect(screen.queryByText('Send reply')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Complete Prepare SQL' }));
  expect(onToggle).toHaveBeenCalledWith(reminders[0]);
  fireEvent.click(screen.getByLabelText('Actions for Prepare SQL'));
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(onEdit).toHaveBeenCalledWith(reminders[0]);
  fireEvent.click(screen.getByLabelText('Actions for Prepare SQL'));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(onDismiss).toHaveBeenCalledWith(reminders[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onDelete).toHaveBeenCalledWith(reminders[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Show done (1)' }));
  expect(screen.getByText('Send reply')).toHaveClass('line-through');
  expect(screen.queryByText('Old reminder')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reopen Send reply' }));
  expect(onToggle).toHaveBeenLastCalledWith(reminders[1]);
});
it('saves reminder date and time without a zone field or API call', async () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <ReminderModal
      initial={{ title: 'Follow up', due_date: '2026-10-09' }}
      relatedLabel="Orbis Ledger"
      onSave={onSave}
      onClose={onClose}
    />
  );
  expect(screen.getByLabelText('Time')).toHaveValue('09:00');
  expect(screen.queryByLabelText('Time zone')).not.toBeInTheDocument();
  expect(screen.getByText('For: Orbis Ledger')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({
      kind: 'recruiter_follow_up',
      title: 'Follow up',
      due_date: '2026-10-09',
      due_time: '09:00',
      note: '',
    })
  );
  expect(onClose).toHaveBeenCalledOnce();
});
it('retains a reminder draft on failure and closes without saving on cancel', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error());
  const onClose = vi.fn();
  render(
    <ReminderModal
      initial={{ title: 'Follow up', due_date: '2026-10-09' }}
      onSave={onSave}
      onClose={onClose}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveValue('Follow up');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledOnce();
});
const statuses = [
  { value: 'open', label: 'Applied', meaning: 'applied' },
  { value: 'reject', label: 'Declined', meaning: 'rejected' },
  { value: 'withdraw', label: 'Withdrawn', meaning: 'withdrawn' },
];
it.each(['reject', 'withdraw'])(
  'shows a reason and suggestions only for the %s meaning',
  async (statusId) => {
    const onSave = vi.fn();
    render(
      <StatusChangeDialog
        options={statuses}
        statusId={statusId}
        timeZone="Europe/Belgrade"
        initial={{ changed_at: '2026-10-08T12:00:00Z' }}
        onSave={onSave}
        onClose={() => {}}
      />
    );
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    expect(document.querySelectorAll('datalist option')).toHaveLength(7);
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Custom reason: moving abroad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        status_id: statusId,
        changed_at: '2026-10-08T12:00:00.000Z',
        comment: '',
        reason: 'Custom reason: moving abroad',
      })
    );
  }
);
it('clears the submitted reason for non-terminal status and blocks a nonexistent local time', async () => {
  const onSave = vi.fn();
  render(
    <StatusChangeDialog
      options={statuses}
      statusId="open"
      timeZone="Europe/Belgrade"
      initial={{ changed_at: '2026-10-08T12:00:00Z', reason: 'Old reason' }}
      onSave={onSave}
      onClose={() => {}}
    />
  );
  expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Date & time'), {
    target: { value: '2026-03-29T02:30' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('does not exist');
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Date & time'), {
    target: { value: '2026-10-08T14:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ reason: null })
    )
  );
});
it('offers Create last, supports keyboard creation and suppresses case-insensitive duplicate names', () => {
  const onCreate = vi.fn();
  const onChange = vi.fn();
  render(
    <SearchableCombobox
      options={[{ value: 'one', label: 'Orbis Ledger' }]}
      value=""
      onChange={onChange}
      onCreate={onCreate}
    />
  );
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Orbis' } });
  expect(
    screen.getAllByRole('option').map((option) => option.textContent)
  ).toEqual(['Orbis Ledger', '+ Create "Orbis"']);
  fireEvent.keyDown(input, { key: 'End' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onCreate).toHaveBeenCalledWith('Orbis');
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: ' ORBIS LEDGER ' } });
  expect(
    screen.queryByRole('option', { name: /Create/ })
  ).not.toBeInTheDocument();
});
it('renders contact actions and entry permissions without translating user content', () => {
  const onUnlink = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onAiChange = vi.fn();
  render(
    <MemoryRouter>
      <ContactRow
        name="Ana"
        href="/contacts/ana"
        role="Recruiter"
        email="ana@example.com"
        phone="+381111"
        onUnlink={onUnlink}
      />
      <EntryRow
        title="Project"
        subtitle="Python"
        aiAllowed={false}
        onAiChange={onAiChange}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </MemoryRouter>
  );
  expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute(
    'href',
    '/contacts/ana'
  );
  expect(screen.getByRole('link', { name: 'Email Ana' })).toHaveAttribute(
    'href',
    'mailto:ana@example.com'
  );
  expect(screen.getByRole('link', { name: 'Call Ana' })).toHaveAttribute(
    'href',
    'tel:+381111'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Unlink Ana' }));
  expect(onUnlink).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(onEdit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onDelete).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('checkbox', { name: 'AI' }));
  expect(onAiChange).toHaveBeenCalledWith(true);
});
it('hides zero task counts and marks overdue counts red', () => {
  const view = render(<TasksBadge count={0} />);
  expect(view.container).toBeEmptyDOMElement();
  view.rerender(<TasksBadge count={3} overdue />);
  expect(screen.getByLabelText('Due today or overdue: 3')).toHaveClass(
    'bg-red'
  );
});
it('starts the month grid on Monday, links events, highlights today and opens hidden events by day', () => {
  const onDayClick = vi.fn();
  const onMonthChange = vi.fn();
  render(
    <MemoryRouter>
      <MonthGrid
        month={new Date(2026, 9, 1)}
        today={new Date(2026, 9, 8)}
        onDayClick={onDayClick}
        onMonthChange={onMonthChange}
        reminderDates={['2026-10-08']}
        events={[
          {
            id: 'one',
            date: '2026-10-08',
            label: '15:00 Orbis',
            href: '/interviews/one',
          },
          { id: 'two', date: '2026-10-08', label: '16:00 Pera' },
          { id: 'three', date: '2026-10-08', label: '17:00 Kedar' },
        ]}
      />
    </MemoryRouter>
  );
  expect(
    screen.getAllByRole('columnheader').map((header) => header.textContent)
  ).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  expect(screen.getAllByRole('cell')[0]).toHaveAttribute(
    'aria-label',
    '2026-09-28'
  );
  expect(screen.getAllByRole('cell')).toHaveLength(35);
  const today = screen.getByRole('cell', { name: '2026-10-08' });
  expect(today).toHaveClass('ring-accent');
  expect(
    within(today).getByRole('link', { name: '15:00 Orbis' })
  ).toHaveAttribute('href', '/interviews/one');
  expect(within(today).getByLabelText('Reminders: 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
  expect(onDayClick).toHaveBeenCalledWith('2026-10-08');
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 10, 1));
});
it('offers Show more for text that wraps beyond six lines at the current width', () => {
  const height = vi
    .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
    .mockReturnValue(140);
  const visible = vi
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockReturnValue(120);
  try {
    render(
      <NotesPanel
        notes={[
          {
            id: 'wrapped',
            body: 'A short text on a narrow screen.',
            created_at: '2026-10-08T09:00:00Z',
          },
        ]}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Show more' })
    ).toBeInTheDocument();
  } finally {
    height.mockRestore();
    visible.mockRestore();
  }
});

it('renders six calendar weeks when required and has Serbian weekday labels', async () => {
  await act(async () => {
    await i18n.changeLanguage('sr-Latn');
  });
  render(<MonthGrid month={new Date(2026, 2, 1)} events={[]} />);
  expect(screen.getAllByRole('cell')).toHaveLength(42);
  expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent('pon');
});
