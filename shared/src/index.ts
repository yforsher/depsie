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

// Each flag is turned on by FEATURE_<NAME>=on on the server; accounts can also be a list of
// GitHub logins (see server/src/features.ts).
export const features = ['report-links', 'accounts'] as const;
export type Feature = (typeof features)[number];

/** GET /api/features */
export interface FeaturesResponse {
  /** The flags on for this caller. */
  enabled: Feature[];
  /** Sign-in works (accounts on, or a list of logins): /signin is shown even without a button. */
  signIn: boolean;
}

/** GET /api/me: the signed-in user, from GitHub; null when nobody is signed in. */
export interface Me {
  id: string;
  name: string;
  login: string;
  image: string | null;
  email: string;
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

/** From this many days after the fetch, a report warns that releases and vulnerabilities may have changed. */
export const STALE_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the data was fetched, at the time `now`, and whether that is too old. */
export function dataAge(fetchedAt: string, now: Date): { days: number; stale: boolean } {
  const days = Math.floor((now.getTime() - Date.parse(fetchedAt)) / DAY_MS);
  return { days, stale: days >= STALE_AFTER_DAYS };
}

/** The version of the Report shape above. Bump it on any change, and add a converter on the server. */
export const REPORT_SCHEMA_VERSION = 1;

/** A saved report as its creator or owner sees it. */
export interface SavedReport {
  id: string;
  /** When the report is deleted (ISO date). */
  expiresAt: string;
  /** The id in the share link, or null while there is none. */
  shareId: string | null;
  /** A signed-in user's report: private, at /reports/:id, its link can be revoked. */
  owned: boolean;
}

/** POST /api/report: the report, and where it was saved; saved is null when nothing was saved. */
export interface ReportResponse {
  report: Report;
  saved: SavedReport | null;
}

/** One version of a saved report, in its version list. */
export interface ReportVersion {
  version: number;
  source: 'pipeline' | 'refresh' | 'chat' | 'agent';
  createdAt: string;
}

/** GET /api/reports/:id: the owner's report, latest version or the one asked for. */
export interface OwnedReport extends SavedReport {
  report: Report;
  /** The version shown. */
  version: number;
  /** Every version, oldest first. */
  versions: ReportVersion[];
  /** Saved with an older schema that could not be converted: shown as saved, read-only. */
  olderFormat: boolean;
}

/** GET /api/reports: one of the signed-in user's reports, in the list. */
export interface ReportSummary {
  id: string;
  need: string;
  framework: Framework;
  /** When its latest version was made (ISO date). */
  updatedAt: string;
  versionCount: number;
  /** It has a share link. */
  shared: boolean;
}

/** GET /api/s/:shareId: a shared report, read-only. */
export interface SharedReport {
  report: Report;
  expiresAt: string;
  /** Anonymous reports can be deleted from their link; signed-in ones cannot. */
  deletable: boolean;
  olderFormat: boolean;
}

/** One UTC day of a signed-in user's AI usage. */
export interface UsageDay {
  /** YYYY-MM-DD, UTC. */
  day: string;
  /** Reports and refreshes run that day. */
  reports: number;
  /** Prompt and completion tokens together. */
  tokens: number;
}

/**
 * GET /api/usage: the last 30 UTC days with usage, newest first, and today's reports against
 * the daily cap. No cost: that is the operator's, not something the user pays.
 */
export interface UsageResponse {
  days: UsageDay[];
  todayReports: number;
  /** Reports per UTC day. */
  dailyCap: number;
}
