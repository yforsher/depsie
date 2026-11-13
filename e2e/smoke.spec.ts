import { test as base, expect } from '@playwright/test';

// The anonymous flow as it works today. It runs against the e2e server (fixtures) in CI and
// against the live URL after a deploy, so it checks only what any report has. Only the second
// test makes a report, so a live run costs one.

// Every test opens the app and fails on any console or page error.
const test = base.extend<{ noErrors: void }>({
  noErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await use();
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

test('the preview shows which package.json entries are sent', async ({ page }) => {
  await page.getByText('Add your package.json (optional)').click();
  await page.getByLabel('Paste package.json').fill(
    JSON.stringify({
      dependencies: {
        react: '^19.0.0',
        '@acme-internal/ui': '^1.0.0',
        'private-lib': 'git+ssh://git@internal.example/private-lib.git',
      },
    }),
  );

  const preview = page.getByRole('region', { name: 'What is sent' });
  await expect(preview.getByText('Dependencies (1)')).toBeVisible();
  await expect(preview.getByRole('listitem').filter({ hasText: 'react' }).first()).toContainText(
    '^19.0.0',
  );
  await expect(preview.getByRole('heading', { name: 'Not sent (2)' })).toBeVisible();
  await expect(preview.getByText('@acme-internal/ui scope not allowed')).toBeVisible();
  await expect(preview.getByText('private-lib not from the npm registry')).toBeVisible();
});

test('a report from need and framework, without package.json', async ({ page }) => {
  await page.getByLabel('What do you need?').fill('Validate forms with a schema');
  await page.getByLabel('Framework').selectOption('React');
  await page.getByRole('button', { name: 'Get recommendation' }).click();

  await expect(page.getByRole('heading', { name: 'Recommendation' })).toBeVisible({
    timeout: 100_000,
  });
  await expect(page.getByRole('heading', { name: /^Why / })).toBeVisible();
  await expect(page.getByText('Recommended', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data sources' })).toBeVisible();
});
