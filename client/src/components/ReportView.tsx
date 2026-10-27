import type { ReactNode } from 'react';
import type {
  CheckStatus,
  Claim,
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
];

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
          {isTop && <span className="badge">Recommended</span>}
        </div>
      </div>
      {facts && <Facts summary={facts} />}
      <Reasons claims={candidate.reasons} />
      <EvidenceDetails claims={[...candidate.reasons, ...factChecks(facts)]} />
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
      <h4>
        <PackageName name={alternative.name} version={alternative.version} />
      </h4>
      <Reasons claims={alternative.reasons} />
      <details>
        <summary>Facts and evidence</summary>
        {facts && <Facts summary={facts} />}
        <EvidenceList claims={[...alternative.reasons, ...factChecks(facts)]} />
      </details>
    </li>
  );
}

// Every link in the report leaves the app, so it opens in a new tab and keeps the report open.
function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

// A claim links to the page of the first field it cites; the evidence list has all of them.
function ClaimText({ claim }: { claim: Claim }) {
  return (
    <ExternalLink href={claim.evidence[0]!.url} className="claim-link">
      {claim.text}
    </ExternalLink>
  );
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
    <div className={`fact fact-${check.status}`}>
      <dt>{label}</dt>
      <dd>
        <span className={`status status-${check.status}`}>{statusLabels[check.status]}</span>{' '}
        <ClaimText claim={check} />
      </dd>
    </div>
  );
}

function Reasons({ claims }: { claims: Claim[] }) {
  return (
    <ul className="reasons">
      {claims.map((claim) => (
        <li key={claim.text}>
          <ClaimText claim={claim} />
        </li>
      ))}
    </ul>
  );
}

function EvidenceDetails({ claims }: { claims: Claim[] }) {
  return (
    <details>
      <summary>Evidence</summary>
      <EvidenceList claims={claims} />
    </details>
  );
}

// Each claim with the fetched fields it cites, so every sentence can be checked.
function EvidenceList({ claims }: { claims: Claim[] }) {
  return (
    <ul className="evidence-list">
      {claims.map((claim) => (
        <li key={claim.text}>
          {claim.text}
          {claim.evidence.map((ref) => (
            <ExternalLink key={`${ref.package} ${ref.field}`} href={ref.url} className="evidence">
              {`${ref.package} ${ref.field}, ${ref.source}, ${formatDate(ref.fetchedAt)}`}
            </ExternalLink>
          ))}
        </li>
      ))}
    </ul>
  );
}

function factChecks(summary: SecuritySummary | undefined) {
  return summary ? factLabels.map(({ key }) => summary[key]) : [];
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
