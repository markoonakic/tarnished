import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Dropdown from './Dropdown';
import FileButton from './FileButton';
afterEach(cleanup);
it('bounds a long selected industry and preserves the dropdown arrow', () => {
  const label = 'J'.repeat(196);
  render(
    <Dropdown
      value="long"
      options={[{ value: 'long', label }]}
      onChange={vi.fn()}
    />
  );
  const text = screen.getByText(label);
  expect(text).toHaveClass('min-w-0', 'truncate');
  const button = screen.getByRole('combobox');
  expect(button.parentElement).toHaveClass('min-w-0', 'max-w-full');
  expect(button.querySelector('.bi-chevron-down')).toHaveClass('shrink-0');
});
it('opens only one native file chooser until selection or cancellation', () => {
  const view = render(<FileButton>Choose</FileButton>);
  const input = view.container.querySelector('input')!;
  const choose = vi.spyOn(input, 'click');
  const button = screen.getByRole('button', { name: 'Choose' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(choose).toHaveBeenCalledOnce();
  fireEvent(input, new Event('cancel', { bubbles: true }));
  fireEvent.click(button);
  expect(choose).toHaveBeenCalledTimes(2);
  fireEvent.change(input, {
    target: { files: [new File(['one'], 'one.wav')] },
  });
  fireEvent.click(button);
  expect(choose).toHaveBeenCalledTimes(3);
});
