import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RequestForm } from './RequestForm';

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<RequestForm onSubmit={onSubmit} isPending={false} />);
  return { onSubmit, user };
}

async function fillRequired(user: User) {
  await user.type(screen.getByLabelText('What do you need?'), 'A date picker');
  await user.selectOptions(screen.getByLabelText('Framework'), 'React');
}

async function pastePackageJson(user: User, text: string) {
  await user.click(screen.getByText('Add your package.json (optional)'));
  await user.click(screen.getByLabelText('Paste package.json'));
  await user.paste(text);
}

const mixedManifest = JSON.stringify({
  dependencies: { react: '^19.0.0', '@acme/ui': '^1.0.0', tools: 'file:../tools' },
});

function submit(user: User) {
  return user.click(screen.getByRole('button', { name: 'Get recommendation' }));
}

describe('RequestForm', () => {
  it('disables submit until both the need and framework are filled in', async () => {
    const { user } = setup();
    const button = screen.getByRole('button', { name: 'Get recommendation' });

    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('What do you need?'), '   ');
    await user.selectOptions(screen.getByLabelText('Framework'), 'React');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('What do you need?'), 'A date picker');
    expect(button).toBeEnabled();
  });

  it('rejects a need over 500 characters', async () => {
    const { onSubmit, user } = setup();
    await user.selectOptions(screen.getByLabelText('Framework'), 'React');
    await user.click(screen.getByLabelText('What do you need?'));
    await user.paste('a'.repeat(501));

    await submit(user);

    expect(screen.getByRole('alert')).toHaveTextContent('under 500 characters');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects invalid package.json', async () => {
    const { onSubmit, user } = setup();
    await fillRequired(user);
    await pastePackageJson(user, '{ not json');

    await submit(user);

    expect(screen.getByRole('alert')).toHaveTextContent('not valid JSON');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits need and framework without dependencies when no file is given', async () => {
    const { onSubmit, user } = setup();
    await fillRequired(user);

    await submit(user);

    expect(onSubmit).toHaveBeenCalledWith({ need: 'A date picker', framework: 'React' });
  });

  it('submits only the filtered dependencies', async () => {
    const { onSubmit, user } = setup();
    await fillRequired(user);
    await pastePackageJson(user, mixedManifest);

    await submit(user);

    expect(onSubmit).toHaveBeenCalledWith({
      need: 'A date picker',
      framework: 'React',
      dependencies: [{ name: 'react', range: '^19.0.0' }],
    });
  });

  it('previews sent and not sent entries with reasons', async () => {
    const { user } = setup();
    await fillRequired(user);
    await pastePackageJson(user, mixedManifest);

    const preview = screen.getByRole('region', { name: 'What is sent' });
    expect(preview).toHaveTextContent('A date picker');
    expect(preview).toHaveTextContent('Dependencies (1)react ^19.0.0');
    expect(preview).toHaveTextContent('Not sent (2)');
    expect(preview).toHaveTextContent('@acme/ui scope not allowed');
    expect(preview).toHaveTextContent('tools not from the npm registry');
    expect(preview).toHaveTextContent('Your package.json itself is never sent');
  });

  it('sends scoped packages once their scope is added in settings', async () => {
    const { onSubmit, user } = setup();
    await fillRequired(user);
    await pastePackageJson(user, JSON.stringify({ dependencies: { '@acme/ui': '^1.0.0' } }));
    await user.type(screen.getByLabelText('Extra allowed scopes'), 'acme');

    await submit(user);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ dependencies: [{ name: '@acme/ui', range: '^1.0.0' }] }),
    );
  });
});
