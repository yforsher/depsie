import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { mockReport } from './mockReport';

type User = ReturnType<typeof userEvent.setup>;

function mockFetch(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(async () => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('/api/report');
  expect(init!.method).toBe('POST');
  return JSON.parse(init!.body as string);
}

function setup() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  return user;
}

async function fillAndSubmit(user: User) {
  await user.type(screen.getByLabelText('What do you need?'), 'A date picker');
  await user.selectOptions(screen.getByLabelText('Framework'), 'React');
  await user.click(screen.getByRole('button', { name: 'Get recommendation' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('goes from form submit to a rendered report from POST /api/report', async () => {
    const fetchMock = mockFetch(() => Response.json(mockReport));
    const user = setup();
    await fillAndSubmit(user);

    const title = await screen.findByRole('heading', { name: 'Recommendation' });
    expect(title.nextElementSibling).toHaveTextContent(
      'A date picker (React), generated Oct 22, 2026',
    );
    expect(screen.getByRole('link', { name: 'react-day-picker@9.11.1' })).toBeInTheDocument();
    expect(sentBody(fetchMock)).toEqual({ need: 'A date picker', framework: 'React' });
  });

  it('submits with Enter in the need field, while Shift+Enter adds a line', async () => {
    const fetchMock = mockFetch(() => Response.json(mockReport));
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Framework'), 'React');
    await user.type(
      screen.getByLabelText('What do you need?'),
      'A date{Shift>}{Enter}{/Shift}picker',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Recommendation' });
    expect(sentBody(fetchMock)).toEqual({ need: 'A date\npicker', framework: 'React' });
  });

  it('does not submit with Enter before the form is filled', async () => {
    const fetchMock = mockFetch(() => Response.json(mockReport));
    const user = setup();
    await user.type(screen.getByLabelText('What do you need?'), 'A date picker{Enter}');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens and closes the privacy details from a link', async () => {
    const user = setup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'How your data is handled' }));
    const privacy = screen.getByRole('dialog', { name: 'How your data is handled' });
    expect(privacy).toHaveTextContent(
      'Your package.json is read in your browser and is never sent.',
    );
    expect(privacy).toHaveTextContent('Nothing you send and no report is stored on our server.');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an empty state in the result column before the first request', () => {
    setup();

    expect(screen.getByRole('region', { name: 'Result' })).toHaveTextContent(
      'Your recommendation appears here.',
    );
  });

  it('sends only the filtered dependencies shown in the preview, never the manifest', async () => {
    const fetchMock = mockFetch(() => Response.json(mockReport));
    const user = setup();
    const manifest = JSON.stringify({
      name: 'internal-app',
      dependencies: { react: '^19.0.0', '@acme/ui': '^1.0.0', tools: 'file:../tools' },
    });
    await user.click(screen.getByText('Add your package.json (optional)'));
    await user.click(screen.getByLabelText('Paste package.json'));
    await user.paste(manifest);
    await fillAndSubmit(user);
    await screen.findByRole('heading', { name: 'Recommendation' });

    expect(sentBody(fetchMock)).toEqual({
      need: 'A date picker',
      framework: 'React',
      dependencies: [{ name: 'react', range: '^19.0.0' }],
    });
    expect(fetchMock.mock.calls[0]![1]!.body).not.toContain('internal-app');
  });

  it('shows a loading state while the report is generated', async () => {
    let resolve: (res: Response) => void = () => {};
    mockFetch(() => new Promise((r) => (resolve = r)));
    const user = setup();
    await fillAndSubmit(user);

    expect(screen.getByRole('status')).toHaveTextContent('This can take a minute.');
    expect(screen.getByRole('button', { name: 'Generating report...' })).toBeDisabled();

    resolve(Response.json(mockReport));
    await screen.findByRole('heading', { name: 'Recommendation' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    [400, { error: 'need: Too big' }, 'The request was not accepted: need: Too big'],
    [
      429,
      { error: 'Too many reports: the limit is 10 per hour.' },
      'Too many reports: the limit is 10 per hour. Please try again later.',
    ],
    [
      502,
      { error: 'The AI step failed: Model cited a field that was not fetched' },
      'The AI could not produce a valid report this time. Please try again.',
    ],
  ])('shows a clear message for status %i', async (status, body, message) => {
    mockFetch(() => Response.json(body, { status }));
    const user = setup();
    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows the status for other failures without reading the body', async () => {
    mockFetch(() => new Response('<html>Internal Server Error</html>', { status: 500 }));
    const user = setup();
    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The report could not be generated (status 500).',
    );
  });
});
