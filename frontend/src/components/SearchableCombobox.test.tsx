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

  it('keeps options out of the tab order and closes when focus leaves', () => {
    const view = render(
      <>
        <SearchableCombobox options={options} value="UTC" onChange={() => {}} />
        <button>Next</button>
      </>
    );
    const input = screen.getByRole('combobox');
    expect(view.container.querySelector('[role="listbox"]')).toHaveAttribute(
      'inert'
    );
    fireEvent.focus(input);
    expect(
      screen.getAllByRole('option').every((option) => option.tabIndex === -1)
    ).toBe(true);
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.focus(input);
    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', { name: 'Next' }),
    });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps focus on Escape and lets only a second Escape reach the parent', () => {
    const escape = vi.fn();
    render(
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') escape();
        }}
      >
        <SearchableCombobox options={options} value="UTC" onChange={() => {}} />
      </div>
    );
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(escape).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(escape).toHaveBeenCalledOnce();
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
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });
});
