export const frameworks = ['React', 'Vue', 'Angular', 'Svelte', 'Node.js', 'None'] as const;
export type Framework = (typeof frameworks)[number];

export interface Dependency {
  name: string;
  range: string;
}

export interface ReportRequest {
  need: string;
  framework: Framework;
  dependencies?: Dependency[];
}

/** Points at one fetched data field; the server checks it exists for the report. */
export interface EvidenceRef {
  package: string;
  field: string;
  source: string;
  fetchedAt: string;
}

export interface Claim {
  text: string;
  evidence: EvidenceRef[];
}

export interface RankedCandidate {
  rank: number;
  name: string;
  version: string;
  reasons: Claim[];
}

export interface RejectedAlternative {
  name: string;
  version: string;
  reasons: Claim[];
}

export type CheckStatus = 'ok' | 'warning' | 'danger';

export interface SecurityCheck extends Claim {
  status: CheckStatus;
}

export interface SecuritySummary {
  name: string;
  version: string;
  license: SecurityCheck;
  vulnerabilities: SecurityCheck;
  maintainers: SecurityCheck;
  dependencyCount: SecurityCheck;
  releaseActivity: SecurityCheck;
}

export interface DataSource {
  name: string;
  url: string;
  fetchedAt: string;
}

export interface Report {
  need: string;
  framework: Framework;
  generatedAt: string;
  ranking: RankedCandidate[];
  rejected: RejectedAlternative[];
  security: SecuritySummary[];
  sources: DataSource[];
}
