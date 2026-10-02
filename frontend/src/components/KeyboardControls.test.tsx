import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dropdown from './Dropdown';
import FileButton from './FileButton';
import Layout from './Layout';
import Modal from './Modal';
import HelpTip from './HelpTip';
import ProgressBar from './ProgressBar';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: {}, signOut: vi.fn() }),
}));
afterEach(cleanup);
it('Space opens and selects; Escape closes only an open dropdown; Tab dismisses', () => {
  const change = vi.fn(),
    escape = vi.fn();
  render(
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape') escape();
      }}
    >
      <Dropdown
        options={[
          { value: 'a', label: 'Applied' },
          { value: 'b', label: 'Interview' },
        ]}
        value="a"
        onChange={change}
      />
    </div>
  );
  const trigger = screen.getByRole('combobox');
  fireEvent.keyDown(trigger, { key: ' ' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(trigger, { key: ' ' });
  expect(change).toHaveBeenCalledWith('b');
  fireEvent.keyDown(trigger, { key: ' ' });
  expect(screen.getAllByRole('option').every((e) => e.tabIndex === -1)).toBe(
    true
  );
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(escape).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(escape).toHaveBeenCalledOnce();
  fireEvent.keyDown(trigger, { key: ' ' });
  fireEvent.keyDown(trigger, { key: 'Tab' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
it.each([
  ['End', 'c'],
  ['ArrowUp', 'c'],
  ['s', 'c'],
])('opens at the requested option with %s', (key, expected) => {
  const change = vi.fn();
  render(
    <Dropdown
      options={[
        { value: 'a', label: 'Applied' },
        { value: 'b', label: 'Interview' },
        { value: 'c', label: 'Screening' },
      ]}
      value=""
      onChange={change}
    />
  );
  const trigger = screen.getByRole('combobox');
  fireEvent.keyDown(trigger, { key });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  expect(change).toHaveBeenCalledWith(expected);
});
it('does not select a missing dropdown option', () => {
  const change = vi.fn();
  render(<Dropdown options={[]} value="" onChange={change} />);
  const trigger = screen.getByRole('combobox');
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  expect(change).not.toHaveBeenCalled();
  expect(trigger).not.toHaveAttribute('aria-activedescendant');
});
it('file activation is a native non-submit button and respects disabled', () => {
  const view = render(<FileButton accept=".pdf">Upload document</FileButton>);
  const input = view.container.querySelector('input')!;
  const click = vi.spyOn(input, 'click');
  fireEvent.click(screen.getByRole('button', { name: 'Upload document' }));
  expect(click).toHaveBeenCalledOnce();
  expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  view.rerender(
    <FileButton disabled accept=".pdf">
      Upload document
    </FileButton>
  );
  fireEvent.click(screen.getByRole('button'));
  expect(click).toHaveBeenCalledOnce();
  expect(input).toBeDisabled();
});
it('closed mobile navigation is inert and hidden from accessibility', () => {
  const { container } = render(
    <MemoryRouter>
      <Layout>Content</Layout>
    </MemoryRouter>
  );
  const menu = container.querySelector('[inert]')!;
  expect(menu).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));
  expect(menu).not.toHaveAttribute('inert');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));
  expect(menu).toHaveAttribute('inert');
});
it('opens help on the first focused click and handles Escape before the parent', () => {
  const escape = vi.fn();
  render(
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape') escape();
      }}
    >
      <HelpTip label="Help">Details</HelpTip>
    </div>
  );
  const button = screen.getByRole('button', { name: 'Help' });
  fireEvent.focus(button);
  fireEvent.click(button);
  expect(screen.getByRole('tooltip')).toBeVisible();
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(escape).not.toHaveBeenCalled();
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(escape).toHaveBeenCalledOnce();
});
it.each([
  [-10, 0],
  [30, 30],
  [110, 100],
])('limits progress %s to %s and labels the control', (progress, expected) => {
  render(<ProgressBar progress={progress} />);
  expect(
    screen.getByRole('progressbar', { name: 'Transfer progress' })
  ).toHaveAttribute('aria-valuenow', String(expected));
  expect(screen.getByText(`${expected}%`)).toBeVisible();
});
it('native dialog cancel preserves busy state and nested cancel does not close parent', () => {
  const outer = vi.fn(),
    inner = vi.fn();
  const view = render(
    <Modal onClose={outer} label="Outer">
      <Modal onClose={inner} label="Inner" busy>
        <button>Busy</button>
      </Modal>
    </Modal>
  );
  fireEvent(
    screen.getByRole('dialog', { name: 'Inner' }),
    new Event('cancel', { bubbles: true, cancelable: true })
  );
  expect(inner).not.toHaveBeenCalled();
  expect(outer).not.toHaveBeenCalled();
  view.rerender(
    <Modal onClose={outer} label="Outer">
      <Modal onClose={inner} label="Inner">
        <button>Ready</button>
      </Modal>
    </Modal>
  );
  fireEvent(
    screen.getByRole('dialog', { name: 'Inner' }),
    new Event('cancel', { bubbles: true, cancelable: true })
  );
  expect(inner).toHaveBeenCalledOnce();
  expect(outer).not.toHaveBeenCalled();
});
