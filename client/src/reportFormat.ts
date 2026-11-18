import type { CheckStatus, EvidenceRef, SecuritySummary } from 'shared';

// Labels and dates shared by the report on screen and its Markdown, so both read the same.

export const statusLabels: Record<CheckStatus, string> = {
  ok: 'OK',
  warning: 'Caution',
  danger: 'Risk',
};

export const factLabels: { key: keyof Omit<SecuritySummary, 'name' | 'version'>; label: string }[] =
  [
    { key: 'license', label: 'License' },
    { key: 'vulnerabilities', label: 'Known vulnerabilities' },
    { key: 'maintainers', label: 'Maintainers' },
    { key: 'dependencyCount', label: 'Dependencies' },
    { key: 'releaseActivity', label: 'Release activity' },
    { key: 'weeklyDownloads', label: 'Weekly downloads' },
    { key: 'stars', label: 'Stars' },
  ];

// One entry per source, in the order cited: "(npm, OSV)".
export function uniqueSources(evidence: EvidenceRef[]): EvidenceRef[] {
  return [...new Map(evidence.map((ref) => [ref.source, ref])).values()];
}

// "Oct 27, 2026". UTC so a fetch date never shifts a day with the viewer's time zone.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso));
}
