import * as z from 'zod';

export const frameworks = [
  'React',
  'Next.js',
  'React Native',
  'Vue',
  'Nuxt',
  'Angular',
  'Svelte',
  'Solid',
  'Node.js',
  'Express',
  'Fastify',
  'NestJS',
  'No framework',
] as const;
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

// Each flag is turned on by FEATURE_<NAME>=on on the server (see server/src/features.ts).
export const features = ['report-links', 'accounts'] as const;
export type Feature = (typeof features)[number];

/** GET /api/features */
export interface FeaturesResponse {
  enabled: Feature[];
}

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
  /** The GitHub repository page, or null when the npm metadata names none. */
  repository: string | null;
  /** The npm description, shown as written (no AI), or null when there is none. */
  description: string | null;
  pros: Claim[];
  cons: Claim[];
}

export interface RejectedAlternative {
  name: string;
  version: string;
  repository: string | null;
  description: string | null;
  pros: Claim[];
  cons: Claim[];
}

export type CheckStatus = 'ok' | 'warning' | 'danger';

/** A fact without a status (a count or a name) is shown as a neutral row. */
export interface SecurityCheck extends Claim {
  status?: CheckStatus;
}

export interface SecuritySummary {
  name: string;
  version: string;
  license: SecurityCheck;
  vulnerabilities: SecurityCheck;
  maintainers: SecurityCheck;
  dependencyCount: SecurityCheck;
  releaseActivity: SecurityCheck;
  weeklyDownloads: SecurityCheck;
  stars: SecurityCheck;
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
  /** Why the rank 1 package suits the need best; null when no package is ranked. */
  summary: Claim | null;
  ranking: RankedCandidate[];
  rejected: RejectedAlternative[];
  security: SecuritySummary[];
  sources: DataSource[];
}
