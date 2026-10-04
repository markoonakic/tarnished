import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider, useToastContext } from '../contexts/ToastContext';
import ToastContainer from './ToastContainer';

afterEach(cleanup);

function Save() {
  const toast = useToastContext();
  return (
    <button
      onClick={() =>
        toast.success('Job lead saved', {
          label: 'Open',
          to: '/job-leads/saved',
        })
      }
    >
      Save
    </button>
  );
}

it('shows the saved lead action and opens its route while dismissing the toast', () => {
  vi.useFakeTimers();
  render(
    <MemoryRouter>
      <ToastProvider>
        <Save />
        <ToastContainer />
        <Routes>
          <Route path="/job-leads/saved" element={<h1>Saved lead</h1>} />
          <Route path="/" element={null} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Job lead saved');
  const open = screen.getByRole('link', { name: 'Open' });
  expect(open).toHaveAttribute('href', '/job-leads/saved');
  fireEvent.click(open);
  expect(screen.getByRole('heading', { name: 'Saved lead' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  vi.clearAllTimers();
  vi.useRealTimers();
});
