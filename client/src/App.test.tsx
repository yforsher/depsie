import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from './App';

it('goes from form submit to a rendered report with the mock API', async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );

  await user.type(screen.getByLabelText('What do you need?'), 'A date picker');
  await user.selectOptions(screen.getByLabelText('Framework'), 'React');
  await user.click(screen.getByRole('button', { name: 'Get recommendation' }));

  expect(await screen.findByRole('heading', { name: 'Recommendation' })).toBeInTheDocument();
  expect(screen.getByText('A date picker (React), generated 2026-10-22')).toBeInTheDocument();
  expect(screen.getByText('1. react-day-picker@9.11.1')).toBeInTheDocument();
});
