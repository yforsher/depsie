import type { Claim, Report, SecurityCheck, SecuritySummary } from 'shared';
import { factLabels, formatDate, statusLabels, uniqueSources } from './reportFormat';

// The report as Markdown, built from the structured report with the same sections, labels and
// sources as ReportView, so the file matches the screen. No AI call, no server request.
export function reportToMarkdown(report: Report): string {
  const facts = (name: string) => report.security.find((s) => s.name === name);
  const lines = [
    '# Recommendation',
    '',
    `${report.need} (${report.framework}), generated ${formatDate(report.generatedAt)}. Data fetched ${formatDate(report.generatedAt)}.`,
    '',
    '## Ranking',
    '',
  ];

  if (report.summary && report.ranking[0]) {
    lines.push(`### Why ${report.ranking[0].name}`, '', claimText(report.summary), '');
  }
  for (const candidate of report.ranking) {
    const recommended = candidate.rank === 1 ? ' (Recommended)' : '';
    lines.push(`### ${candidate.rank}. ${candidate.name}@${candidate.version}${recommended}`, '');
    lines.push(...packageLines(candidate.name, candidate.version, candidate.repository));
    lines.push(...descriptionLines(candidate.description));
    lines.push(...factLines(facts(candidate.name)));
    lines.push(...claimLines('Pros', candidate.pros), ...claimLines('Cons', candidate.cons));
  }

  if (report.rejected.length > 0) {
    lines.push('## Alternatives considered', '');
    for (const alternative of report.rejected) {
      lines.push(`### ${alternative.name}@${alternative.version}`, '');
      lines.push(...packageLines(alternative.name, alternative.version, alternative.repository));
      lines.push(...descriptionLines(alternative.description));
      // The cons say why it was rejected, so they come first, as on screen.
      lines.push(...claimLines('Cons', alternative.cons), ...claimLines('Pros', alternative.pros));
      lines.push(...factLines(facts(alternative.name)));
    }
  }

  lines.push('## Data sources', '');
  for (const source of report.sources) {
    lines.push(`- [${source.name}](${source.url}), fetched ${formatDate(source.fetchedAt)}`);
  }
  lines.push('');
  return lines.join('\n');
}

function packageLines(name: string, version: string, repository: string | null) {
  const npm = `[npm](https://www.npmjs.com/package/${name}/v/${version})`;
  return [repository ? `${npm}, [GitHub](${repository})` : npm, ''];
}

function descriptionLines(description: string | null) {
  return description ? [description, ''] : [];
}

function factLines(summary: SecuritySummary | undefined) {
  if (!summary) return [];
  return [...factLabels.map(({ key, label }) => `- ${label}: ${checkText(summary[key])}`), ''];
}

function checkText(check: SecurityCheck) {
  const status = check.status ? `${statusLabels[check.status]}, ` : '';
  return `${status}${claimText(check)}`;
}

function claimLines(title: 'Pros' | 'Cons', claims: Claim[]) {
  if (claims.length === 0) return [];
  return [`**${title}**`, '', ...claims.map((claim) => `- ${claimText(claim)}`), ''];
}

// "6.1 million weekly downloads (npm, OSV)", as on screen.
function claimText(claim: Claim) {
  const sources = uniqueSources(claim.evidence).map((ref) => ref.source);
  return `${claim.text} (${sources.join(', ')})`;
}
