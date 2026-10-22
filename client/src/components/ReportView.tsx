import type { CheckStatus, Claim, Report, SecurityCheck, SecuritySummary } from 'shared';

const statusLabels: Record<CheckStatus, string> = {
  ok: 'OK',
  warning: 'Caution',
  danger: 'Risk',
};

const securityColumns: { key: keyof Omit<SecuritySummary, 'name' | 'version'>; label: string }[] = [
  { key: 'license', label: 'License' },
  { key: 'vulnerabilities', label: 'Known vulnerabilities' },
  { key: 'maintainers', label: 'Maintainers' },
  { key: 'dependencyCount', label: 'Dependencies' },
  { key: 'releaseActivity', label: 'Release activity' },
];

export function ReportView({ report }: { report: Report }) {
  return (
    <article className="report" aria-labelledby="report-title">
      <h2 id="report-title">Recommendation</h2>
      <p className="hint">
        {report.need} ({report.framework}), generated {formatDate(report.generatedAt)}
      </p>

      <section>
        <h3>Ranking</h3>
        <ol className="cards">
          {report.ranking.map((candidate) => (
            <li key={candidate.name} className="panel">
              <h4>
                {candidate.rank}. {candidate.name}@{candidate.version}
              </h4>
              <Claims claims={candidate.reasons} />
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3>Alternatives considered</h3>
        <ul className="cards">
          {report.rejected.map((alternative) => (
            <li key={alternative.name} className="panel">
              <h4>
                {alternative.name}@{alternative.version}
              </h4>
              <Claims claims={alternative.reasons} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Security and compliance</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Package</th>
                {securityColumns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.security.map((summary) => (
                <tr key={summary.name}>
                  <th scope="row">
                    {summary.name}@{summary.version}
                  </th>
                  {securityColumns.map((column) => (
                    <td key={column.key}>
                      <Check check={summary[column.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>Data sources</h3>
        <ul>
          {report.sources.map((source) => (
            <li key={source.name}>
              <a href={source.url}>{source.name}</a>, fetched {formatDate(source.fetchedAt)}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function Claims({ claims }: { claims: Claim[] }) {
  return (
    <ul className="claims">
      {claims.map((claim) => (
        <li key={claim.text}>
          {claim.text}
          <Evidence claim={claim} />
        </li>
      ))}
    </ul>
  );
}

function Check({ check }: { check: SecurityCheck }) {
  return (
    <>
      <span className={`status status-${check.status}`}>{statusLabels[check.status]}</span>{' '}
      {check.text}
      <Evidence claim={check} />
    </>
  );
}

function Evidence({ claim }: { claim: Claim }) {
  return (
    <span className="evidence">
      {claim.evidence
        .map((ref) => `${ref.package} ${ref.field}, ${ref.source}, ${formatDate(ref.fetchedAt)}`)
        .join('; ')}
    </span>
  );
}

function formatDate(iso: string) {
  return iso.slice(0, 10);
}
