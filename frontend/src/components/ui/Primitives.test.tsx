import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Button from './Button';
import TextLink from './TextLink';
import Dropdown from '../Dropdown';

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
