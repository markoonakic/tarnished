import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useUnsavedChanges } from './useUnsavedChanges';

function Draft({ active = true }: { active?: boolean }) {
  useUnsavedChanges(active);
  return <a href="/other">Other page</a>;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('blocks single-entry Back before BrowserRouter can unmount the draft', () => {
  window.history.replaceState({ idx: 1 }, '', '/draft');
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
  const view = render(
    <BrowserRouter>
      <Routes>
        <Route path="/draft" element={<Draft />} />
        <Route path="/other" element={<p>List page</p>} />
      </Routes>
    </BrowserRouter>
  );
  window.history.replaceState({ idx: 0 }, '', '/other');
  window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 0 } }));
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(go).toHaveBeenCalledWith(1);
  expect(view.getByText('Other page')).toBeInTheDocument();
  expect(view.queryByText('List page')).not.toBeInTheDocument();
  window.history.replaceState({ idx: 1 }, '', '/draft');
  window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 1 } }));
});

it('warns before reload while active and removes the warning after save', () => {
  const view = render(<Draft />);
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  view.rerender(<Draft active={false} />);
  const saved = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(saved);
  expect(saved.defaultPrevented).toBe(false);
});
it('cancels link navigation when the user keeps the draft', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const view = render(<Draft />);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  view.getByText('Other page').dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(window.confirm).toHaveBeenCalledOnce();
});
it('restores a cancelled Back or Forward before the router can discard the editor', () => {
  window.history.replaceState({ idx: 2 }, '', '/');
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
  render(<Draft />);
  const router = vi.fn();
  window.addEventListener('popstate', router);
  window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 1 } }));
  expect(go).toHaveBeenCalledWith(1);
  expect(router).not.toHaveBeenCalled();
  window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 2 } }));
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(router).not.toHaveBeenCalled();
  window.removeEventListener('popstate', router);
});
