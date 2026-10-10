import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiV030 } from '@/lib/apiV030';
import { MAX_SEARCH_LENGTH } from '@/lib/recordFilters';
import ReminderRecordPicker from './ReminderRecordPicker';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('bounds reminder queries before sending all three searches and keeps a selectable match', async () => {
  vi.spyOn(apiV030, 'applications').mockResolvedValue({
    items: [{ id: 'app', company: 'Acme', job_title: 'W'.repeat(222) }],
    total: 1,
    page: 1,
    per_page: 25,
  } as Awaited<ReturnType<typeof apiV030.applications>>);
  vi.spyOn(apiV030, 'leads').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    per_page: 25,
  } as Awaited<ReturnType<typeof apiV030.leads>>);
  vi.spyOn(apiV030, 'companies').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    per_page: 25,
  } as Awaited<ReturnType<typeof apiV030.companies>>);
  const onChange = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReminderRecordPicker value="" onChange={onChange} />
    </QueryClientProvider>
  );
  const search = screen.getByLabelText(
    'Search applications, leads and companies'
  );
  expect(search).toHaveAttribute('maxlength', String(MAX_SEARCH_LENGTH));
  fireEvent.change(search, { target: { value: 'W'.repeat(80001) } });
  await waitFor(() =>
    expect(apiV030.applications).toHaveBeenCalledWith({
      search: 'W'.repeat(200),
      per_page: 25,
    })
  );
  expect(apiV030.leads).toHaveBeenCalledWith({
    search: 'W'.repeat(200),
    per_page: 25,
  });
  expect(apiV030.companies).toHaveBeenCalledWith({
    query: 'W'.repeat(200),
    per_page: 25,
  });
  expect(search).toHaveValue('W'.repeat(200));
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
  fireEvent.click(
    await screen.findByRole('option', { name: 'Acme — ' + 'W'.repeat(222) })
  );
  expect(onChange).toHaveBeenCalledWith(
    'application:app',
    expect.objectContaining({ type: 'application', id: 'app' })
  );
});
