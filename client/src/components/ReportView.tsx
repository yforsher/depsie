import type { ReactNode } from 'react';
import type {
  CheckStatus,
  Claim,
  EvidenceRef,
  RankedCandidate,
  RejectedAlternative,
  Report,
  SecurityCheck,
  SecuritySummary,
} from 'shared';

const statusLabels: Record<CheckStatus, string> = {
  ok: 'OK',
  warning: 'Caution',
  danger: 'Risk',
};

const factLabels: { key: keyof Omit<SecuritySummary, 'name' | 'version'>; label: string }[] = [
  { key: 'license', label: 'License' },
  { key: 'vulnerabilities', label: 'Known vulnerabilities' },
  { key: 'maintainers', label: 'Maintainers' },
  { key: 'dependencyCount', label: 'Dependencies' },
  { key: 'releaseActivity', label: 'Release activity' },
  { key: 'weeklyDownloads', label: 'Weekly downloads' },
  { key: 'stars', label: 'Stars' },
];

// The package name already links to npm and the GitHub badge to the repository, so only the
// sources a card does not otherwise link to get a link of their own.
const linkedSources = new Set(['OSV', 'deps.dev']);

export function ReportView({ report }: { report: Report }) {
  const facts = (name: string) => report.security.find((s) => s.name === name);

  return (
    <article className="report" aria-labelledby="report-title">
      <header>
        <h2 id="report-title">Recommendation</h2>
        <p className="hint">
          {report.need} ({report.framework}), generated{' '}
          <span className="nowrap">{formatDate(report.generatedAt)}</span>
        </p>
      </header>

      <section aria-labelledby="ranking-title">
        <h3 id="ranking-title">Ranking</h3>
        {/* The summary compares the top pick with the next one, so it sits above both cards. */}
        {report.summary && report.ranking[0] && (
          <div className="summary">
            <h4>Why {report.ranking[0].name}</h4>
            <p>
              <ClaimText claim={report.summary} />
            </p>
          </div>
        )}
        <ol className="cards">
          {report.ranking.map((candidate) => (
            <CandidateCard
              key={candidate.name}
              candidate={candidate}
              facts={facts(candidate.name)}
            />
          ))}
        </ol>
      </section>

      {report.rejected.length > 0 && (
        <section aria-labelledby="rejected-title">
          <h3 id="rejected-title">Alternatives considered</h3>
          <ul className="cards">
            {report.rejected.map((alternative) => (
              <RejectedItem
                key={alternative.name}
                alternative={alternative}
                facts={facts(alternative.name)}
              />
            ))}
          </ul>
        </section>
      )}

      <footer className="sources">
        <h3>Data sources</h3>
        <ul>
          {report.sources.map((source) => (
            <li key={`${source.name} ${source.url}`}>
              <ExternalLink href={source.url}>{source.name}</ExternalLink>, fetched{' '}
              <span className="nowrap">{formatDate(source.fetchedAt)}</span>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  );
}

interface CardProps {
  candidate: RankedCandidate;
  facts: SecuritySummary | undefined;
}

function CandidateCard({ candidate, facts }: CardProps) {
  const isTop = candidate.rank === 1;
  return (
    <li className={isTop ? 'candidate top' : 'candidate'}>
      <div className="candidate-head">
        <span className="rank" aria-hidden="true">
          {candidate.rank}
        </span>
        <div className="candidate-title">
          <h4>
            <PackageName name={candidate.name} version={candidate.version} />
          </h4>
          <GithubBadge repository={candidate.repository} />
          {isTop && <span className="badge">Recommended</span>}
        </div>
      </div>
      <Description text={candidate.description} />
      {facts && <Facts summary={facts} />}
      <ProsCons pros={candidate.pros} cons={candidate.cons} />
    </li>
  );
}

interface RejectedProps {
  alternative: RejectedAlternative;
  facts: SecuritySummary | undefined;
}

function RejectedItem({ alternative, facts }: RejectedProps) {
  return (
    <li className="candidate rejected">
      <div className="candidate-title">
        <h4>
          <PackageName name={alternative.name} version={alternative.version} />
        </h4>
        <GithubBadge repository={alternative.repository} />
      </div>
      <Description text={alternative.description} />
      {/* The cons say why it was rejected; the rest stays collapsed. */}
      <ProsCons pros={[]} cons={alternative.cons} />
      <details>
        <summary>Pros and facts</summary>
        <ProsCons pros={alternative.pros} cons={[]} />
        {facts && <Facts summary={facts} />}
      </details>
    </li>
  );
}

// Every link in the report leaves the app, so it opens in a new tab and keeps the report open.
function ExternalLink({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

// A claim reads as plain text followed by its sources: "6.1 million weekly downloads (npm)".
function ClaimText({ claim }: { claim: Claim }) {
  return (
    <>
      {claim.text} <SourceLabels evidence={claim.evidence} />
    </>
  );
}

function SourceLabels({ evidence }: { evidence: EvidenceRef[] }) {
  const bySource = new Map(evidence.map((ref) => [ref.source, ref]));
  const labels = [...bySource.values()].map((ref, i) => (
    <span key={ref.source}>
      {i > 0 && ', '}
      {linkedSources.has(ref.source) ? (
        <ExternalLink
          href={ref.url}
          className="source-link"
          title={`${ref.package} ${ref.field}, fetched ${formatDate(ref.fetchedAt)}`}
        >
          {ref.source}
        </ExternalLink>
      ) : (
        ref.source
      )}
    </span>
  ));
  return <span className="source">({labels})</span>;
}

function GithubBadge({ repository }: { repository: string | null }) {
  if (!repository) return null;
  return (
    <ExternalLink href={repository} className="repo-badge">
      GitHub
    </ExternalLink>
  );
}

// The package's own npm description, as its author wrote it.
function Description({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="description">{text}</p>;
}

function PackageName({ name, version }: { name: string; version: string }) {
  return (
    <ExternalLink href={`https://www.npmjs.com/package/${name}/v/${version}`}>
      {name}
      <span className="version">@{version}</span>
    </ExternalLink>
  );
}

function Facts({ summary }: { summary: SecuritySummary }) {
  return (
    <dl className="facts">
      {factLabels.map(({ key, label }) => (
        <Fact key={key} label={label} check={summary[key]} />
      ))}
    </dl>
  );
}

function Fact({ label, check }: { label: string; check: SecurityCheck }) {
  return (
    <div className={check.status ? `fact fact-${check.status}` : 'fact'}>
      <dt>{label}</dt>
      <dd>
        {check.status && (
          <>
            <span className={`status status-${check.status}`}>
              {statusLabels[check.status]}
            </span>{' '}
          </>
        )}
        {/* Fact values are short; kept whole so a date never breaks at its hyphens. */}
        <span className="nowrap">{check.text}</span> <SourceLabels evidence={check.evidence} />
      </dd>
    </div>
  );
}

function ProsCons({ pros, cons }: { pros: Claim[]; cons: Claim[] }) {
  return (
    <div className="pros-cons">
      <ClaimList title="Pros" claims={pros} />
      <ClaimList title="Cons" claims={cons} />
    </div>
  );
}

function ClaimList({ title, claims }: { title: 'Pros' | 'Cons'; claims: Claim[] }) {
  if (claims.length === 0) return null;
  return (
    <div className={title === 'Pros' ? 'claims claims-pros' : 'claims claims-cons'}>
      <h5>{title}</h5>
      <ul className="reasons">
        {claims.map((claim) => (
          <li key={claim.text}>
            <ClaimText claim={claim} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// "Oct 27, 2026". UTC so a fetch date never shifts a day with the viewer's time zone.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatDate(iso: string) {
  return dateFormat.format(new Date(iso));
}
