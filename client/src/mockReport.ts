import type { EvidenceRef, Report } from 'shared';

const fetchedAt = '2026-10-22T09:00:00Z';

const pages: Record<string, (pkg: string) => string> = {
  npm: (pkg) => `https://www.npmjs.com/package/${pkg}`,
  'deps.dev': (pkg) => `https://deps.dev/npm/${pkg}`,
  OSV: (pkg) => `https://osv.dev/list?ecosystem=npm&q=${pkg}`,
  GitHub: (pkg) => `https://github.com/example/${pkg}`,
};

function ref(pkg: string, field: string, source: string): EvidenceRef {
  return { package: pkg, field, source, url: pages[source]!(pkg), fetchedAt };
}

export const mockReport: Report = {
  need: 'A date picker',
  framework: 'React',
  generatedAt: '2026-10-22T09:00:05Z',
  summary: {
    text: 'Ships TypeScript types and declares react >=16.8.0 as its only peer dependency, with the most weekly downloads of the candidates.',
    evidence: [
      ref('react-day-picker', 'npm.types', 'npm'),
      ref('react-day-picker', 'npm.peerDependencies', 'npm'),
    ],
  },
  ranking: [
    {
      rank: 1,
      name: 'react-day-picker',
      version: '9.11.1',
      repository: 'https://github.com/gpbl/react-day-picker',
      description: 'Customizable Date Picker for React',
      pros: [
        {
          text: '6.1 million weekly downloads, the most of the candidates.',
          evidence: [ref('react-day-picker', 'downloads.weekly', 'npm')],
        },
        {
          text: 'Declares react >=16.8.0 as a peer dependency; no known vulnerabilities.',
          evidence: [
            ref('react-day-picker', 'npm.peerDependencies', 'npm'),
            ref('react-day-picker', 'vulnerabilities.known', 'OSV'),
          ],
        },
      ],
      cons: [
        {
          text: 'Unpacked size 2.1 MB, the largest of the candidates.',
          evidence: [ref('react-day-picker', 'npm.unpackedSize', 'npm')],
        },
      ],
    },
    {
      rank: 2,
      name: 'react-datepicker',
      version: '8.8.0',
      repository: null,
      description: null,
      pros: [
        {
          text: 'Includes a time picker according to its README.',
          evidence: [ref('react-datepicker', 'readme.text', 'npm')],
        },
      ],
      cons: [
        {
          text: 'Has 6 dependencies against 1 for react-day-picker.',
          evidence: [
            ref('react-datepicker', 'dependencies.total', 'deps.dev'),
            ref('react-day-picker', 'dependencies.total', 'deps.dev'),
          ],
        },
      ],
    },
  ],
  rejected: [
    {
      name: 'react-dates',
      version: '21.8.0',
      repository: 'https://github.com/react-dates/react-dates',
      description: 'A responsive and accessible date range picker component built with React',
      pros: [
        {
          text: 'Supports date range selection according to its README.',
          evidence: [ref('react-dates', 'readme.text', 'npm')],
        },
      ],
      cons: [
        {
          text: 'Peer dependency react ^0.14 || ^15.5.4 || ^16.1.1.',
          evidence: [ref('react-dates', 'npm.peerDependencies', 'npm')],
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
        evidence: [ref('react-day-picker', 'npm.license', 'npm')],
      },
      vulnerabilities: {
        status: 'ok',
        text: '0 known',
        evidence: [ref('react-day-picker', 'vulnerabilities.known', 'OSV')],
      },
      maintainers: {
        text: 'gpbl',
        evidence: [ref('react-day-picker', 'npm.maintainers', 'npm')],
      },
      dependencyCount: {
        status: 'ok',
        text: '1',
        evidence: [ref('react-day-picker', 'dependencies.total', 'deps.dev')],
      },
      releaseActivity: {
        status: 'ok',
        text: '2026-09-30',
        evidence: [ref('react-day-picker', 'npm.versionReleaseDate', 'npm')],
      },
      weeklyDownloads: {
        text: '6,104,220',
        evidence: [ref('react-day-picker', 'downloads.weekly', 'npm')],
      },
      stars: {
        text: '6,512',
        evidence: [ref('react-day-picker', 'github.stars', 'GitHub')],
      },
    },
    {
      name: 'react-datepicker',
      version: '8.8.0',
      license: {
        status: 'ok',
        text: 'MIT',
        evidence: [ref('react-datepicker', 'npm.license', 'npm')],
      },
      vulnerabilities: {
        status: 'danger',
        text: '4 known',
        evidence: [ref('react-datepicker', 'vulnerabilities.known', 'OSV')],
      },
      maintainers: {
        text: '2',
        evidence: [ref('react-datepicker', 'npm.maintainers', 'npm')],
      },
      dependencyCount: {
        status: 'warning',
        text: '6',
        evidence: [ref('react-datepicker', 'dependencies.total', 'deps.dev')],
      },
      releaseActivity: {
        status: 'ok',
        text: '2026-08-12',
        evidence: [ref('react-datepicker', 'npm.versionReleaseDate', 'npm')],
      },
      weeklyDownloads: {
        text: '3,402,118',
        evidence: [ref('react-datepicker', 'downloads.weekly', 'npm')],
      },
      stars: {
        text: 'unavailable',
        evidence: [ref('react-datepicker', 'github.unavailable', 'GitHub')],
      },
    },
  ],
  sources: [
    { name: 'npm', url: 'https://www.npmjs.com', fetchedAt },
    { name: 'deps.dev', url: 'https://deps.dev', fetchedAt },
    { name: 'OSV', url: 'https://osv.dev', fetchedAt },
    { name: 'GitHub', url: 'https://github.com', fetchedAt },
  ],
};
