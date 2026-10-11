import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TagInput from './TagInput';
afterEach(cleanup);
it('bounds pasted tags before submission and keeps long saved tags inside their field', () => {
  const change = vi.fn();
  render(<TagInput label="Tags" value={['W'.repeat(301)]} onChange={change} />);
  const input = screen.getByLabelText('Tags');
  expect(input).toHaveAttribute('maxLength', '100');
  fireEvent.change(input, { target: { value: 'W'.repeat(81007) } });
  expect(input).toHaveValue('W'.repeat(100));
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(change).toHaveBeenCalledWith(['W'.repeat(301), 'W'.repeat(100)]);
  const saved = screen.getByTitle('W'.repeat(301));
  expect(saved).toHaveClass('truncate', 'min-w-0');
  expect(saved.parentElement).toHaveClass('max-w-full', 'min-w-0');
});
it('bounds the number of filter tags', () => {
  render(
    <TagInput
      label="Tags"
      value={Array.from({ length: 10 }, (_, i) => String(i))}
      maxTags={10}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText('Tags')).toBeDisabled();
});
