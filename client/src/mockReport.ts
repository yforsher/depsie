import type { EvidenceRef, Report } from 'shared';

const fetchedAt = '2026-10-22T09:00:00Z';

function ref(pkg: string, field: string, source: string): EvidenceRef {
  return { package: pkg, field, source, fetchedAt };
}

export const mockReport: Report = {
  need: 'A date picker',
  framework: 'React',
  generatedAt: '2026-10-22T09:00:05Z',
  ranking: [
    {
      rank: 1,
      name: 'react-day-picker',
      version: '9.11.1',
      reasons: [
        {
          text: '6.1 million weekly downloads, the highest of the candidates.',
          evidence: [ref('react-day-picker', 'downloads.weekly', 'npm downloads API')],
        },
        {
          text: 'Declares react >=16.8.0 as a peer dependency.',
          evidence: [ref('react-day-picker', 'peerDependencies', 'npm registry')],
        },
      ],
    },
    {
      rank: 2,
      name: 'react-datepicker',
      version: '8.8.0',
      reasons: [
        {
          text: '3.4 million weekly downloads.',
          evidence: [ref('react-datepicker', 'downloads.weekly', 'npm downloads API')],
        },
        {
          text: 'Has 6 runtime dependencies against 1 for react-day-picker.',
          evidence: [
            ref('react-datepicker', 'dependencyCount', 'npm registry'),
            ref('react-day-picker', 'dependencyCount', 'npm registry'),
          ],
        },
      ],
    },
  ],
  rejected: [
    {
      name: 'react-dates',
      version: '21.8.0',
      reasons: [
        {
          text: 'Last release was published on 2020-03-27.',
          evidence: [ref('react-dates', 'time.lastPublish', 'npm registry')],
        },
      ],
    },
  ],
  security: [
    {
      name: 'react-day-picker',
      version: '9.11.1',
      license: {
        status: 'ok',
        text: 'MIT',
        evidence: [ref('react-day-picker', 'license', 'npm registry')],
      },
      vulnerabilities: {
        status: 'ok',
        text: 'No known vulnerabilities for 9.11.1.',
        evidence: [ref('react-day-picker', 'vulns', 'OSV.dev')],
      },
      maintainers: {
        status: 'ok',
        text: '2 maintainers.',
        evidence: [ref('react-day-picker', 'maintainers', 'npm registry')],
      },
      dependencyCount: {
        status: 'ok',
        text: '1 runtime dependency.',
        evidence: [ref('react-day-picker', 'dependencyCount', 'npm registry')],
      },
      releaseActivity: {
        status: 'ok',
        text: 'Last release on 2026-09-30.',
        evidence: [ref('react-day-picker', 'time.lastPublish', 'npm registry')],
      },
    },
    {
      name: 'react-datepicker',
      version: '8.8.0',
      license: {
        status: 'ok',
        text: 'MIT',
        evidence: [ref('react-datepicker', 'license', 'npm registry')],
      },
      vulnerabilities: {
        status: 'ok',
        text: 'No known vulnerabilities for 8.8.0.',
        evidence: [ref('react-datepicker', 'vulns', 'OSV.dev')],
      },
      maintainers: {
        status: 'warning',
        text: '1 maintainer.',
        evidence: [ref('react-datepicker', 'maintainers', 'npm registry')],
      },
      dependencyCount: {
        status: 'ok',
        text: '6 runtime dependencies.',
        evidence: [ref('react-datepicker', 'dependencyCount', 'npm registry')],
      },
      releaseActivity: {
        status: 'ok',
        text: 'Last release on 2026-08-12.',
        evidence: [ref('react-datepicker', 'time.lastPublish', 'npm registry')],
      },
    },
  ],
  sources: [
    { name: 'npm registry', url: 'https://registry.npmjs.org', fetchedAt },
    { name: 'npm downloads API', url: 'https://api.npmjs.org/downloads', fetchedAt },
    { name: 'OSV.dev', url: 'https://osv.dev', fetchedAt },
  ],
};
