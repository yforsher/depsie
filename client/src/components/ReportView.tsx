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
          {report.need} ({report.framework}), generated {formatDate(report.generatedAt)}
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
              <a href={source.url}>{source.name}</a>, fetched {formatDate(source.fetchedAt)}
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
        <h4>
          <PackageName name={candidate.name} version={candidate.version} />
        </h4>
        {isTop && <span className="badge">Recommended</span>}
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

function PackageName({ name, version }: { name: string; version: string }) {
  return (
    <a href={`https://www.npmjs.com/package/${name}/v/${version}`}>
      {name}
      <span className="version">@{version}</span>
    </a>
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
        {check.text}
      </dd>
    </div>
  );
}

function Reasons({ claims }: { claims: Claim[] }) {
  return (
    <ul className="reasons">
      {claims.map((claim) => (
        <li key={claim.text}>{claim.text}</li>
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
            <span key={`${ref.package} ${ref.field}`} className="evidence">
              {`${ref.package} ${ref.field}, ${ref.source}, ${formatDate(ref.fetchedAt)}`}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

function factChecks(summary: SecuritySummary | undefined) {
  return summary ? factLabels.map(({ key }) => summary[key]) : [];
}

function formatDate(iso: string) {
  return iso.slice(0, 10);
}
