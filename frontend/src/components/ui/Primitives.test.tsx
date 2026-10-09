import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Button from './Button';
import TextLink from './TextLink';
import RecordLink from './RecordLink';
import Dropdown from '../Dropdown';
import FileButton from '../FileButton';

afterEach(cleanup);
it.each(['primary', 'ghost', 'danger', 'icon'] as const)(
  '%s actions share the pointer, hover, font and focus contract',
  (variant) => {
    const click = vi.fn();
    render(
      <Button
        type="button"
        variant={variant}
        onClick={click}
        aria-label="Action"
      >
        Action
      </Button>
    );
    const button = screen.getByRole('button');
    expect(button).toHaveClass(
      'cursor-pointer',
      'text-sm',
      'font-mono',
      'focus:ring-2',
      'focus:ring-accent'
    );
    expect(button.className).toContain('hover:bg-');
    fireEvent.click(button);
    expect(click).toHaveBeenCalledOnce();
    if (variant === 'icon') expect(button).toHaveAttribute('title', 'Action');
  }
);
it('an action inside a form does not submit unless explicitly requested', () => {
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <Button>Remove participant</Button>
      <Button type="submit">Save</Button>
    </form>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove participant' }));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(submit).toHaveBeenCalledOnce();
});
it('file pickers keep primary upload and secondary replacement variants', () => {
  render(
    <>
      <FileButton variant="primary">Upload</FileButton>
      <FileButton>Replace</FileButton>
    </>
  );
  expect(screen.getByRole('button', { name: 'Upload' })).toHaveAttribute(
    'data-variant',
    'primary'
  );
  expect(screen.getByRole('button', { name: 'Replace' })).toHaveAttribute(
    'data-variant',
    'ghost'
  );
});
it('navigation stays a link with no background or button role', () => {
  render(
    <MemoryRouter>
      <TextLink to="/profile">Open profile</TextLink>
      <TextLink href="https://example.org">Website</TextLink>
    </MemoryRouter>
  );
  for (const link of screen.getAllByRole('link')) {
    expect(link).toHaveClass(
      'text-accent',
      'hover:text-accent-bright',
      'cursor-pointer',
      'text-sm',
      'font-mono'
    );
    expect(link.className).not.toMatch(/\bbg-|hover:bg-/);
  }
});
it('mobile record cards keep their surface outside the navigation link', () => {
  render(
    <MemoryRouter>
      <RecordLink to="/applications/1" surface="secondary">
        Record
      </RecordLink>
    </MemoryRouter>
  );
  const link = screen.getByRole('link', { name: 'Record' });
  expect(link.parentElement).toHaveClass('bg-secondary', 'rounded-lg', 'p-4');
  expect(link).toHaveClass('text-accent', 'hover:text-accent-bright');
  expect(link.className).not.toMatch(/\bbg-|hover:bg-/);
});
it('the shared option layer is opaque, bordered and above cards', () => {
  render(
    <Dropdown
      options={[{ value: 'a', label: 'Alpha' }]}
      value=""
      onChange={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('combobox'));
  expect(screen.getByRole('listbox')).toHaveClass(
    'bg-bg0',
    'border',
    'shadow-xl',
    'z-[1000]'
  );
});
