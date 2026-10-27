import * as z from 'zod';

export const frameworks = ['React', 'Vue', 'Angular', 'Svelte', 'Node.js', 'None'] as const;
export type Framework = (typeof frameworks)[number];

// Size limits keep the AI prompt, and so the cost per request, bounded.
// 214 is npm's own maximum package name length.
export const dependencySchema = z.object({
  name: z.string().min(1).max(214),
  range: z.string().min(1).max(100),
});
export type Dependency = z.infer<typeof dependencySchema>;

export const reportRequestSchema = z.object({
  need: z.string().trim().min(1).max(500),
  framework: z.enum(frameworks),
  dependencies: z.array(dependencySchema).max(200).optional(),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

/** Points at one fetched data field; the server checks it exists for the report. */
export interface EvidenceRef {
  package: string;
  field: string;
  source: string;
  /** The web page where a person can see the same data. */
  url: string;
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
  /** The web page for the data, not the API response it was fetched from. */
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
