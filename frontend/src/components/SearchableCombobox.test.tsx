import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SearchableCombobox from './SearchableCombobox';

const options = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Belgrade', label: 'Europe/Belgrade' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
];

describe('SearchableCombobox', () => {
  afterEach(() => {
    cleanup();
  });

  it('filters options as the user types and selects a result', () => {
    const onChange = vi.fn();

    render(
      <SearchableCombobox
        options={options}
        value="America/New_York"
        onChange={onChange}
        id="timezone-search"
      />
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'los' } });

    expect(
      screen.getByRole('option', { name: 'America/Los_Angeles' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Europe/Belgrade' })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('option', { name: 'America/Los_Angeles' })
    );

    expect(onChange).toHaveBeenCalledWith('America/Los_Angeles');
  });

  it('shows a no-results state for unmatched queries', () => {
    render(
      <SearchableCombobox
        options={options}
        value="UTC"
        onChange={() => {}}
        id="timezone-search"
      />
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(screen.getByText('No matches found.')).toBeInTheDocument();
  });
});
