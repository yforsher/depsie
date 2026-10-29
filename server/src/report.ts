import type { Claim, DataSource, Report, ReportRequest, SecurityCheck } from 'shared';
import * as z from 'zod';
import { findCandidates } from './candidates.js';
import { AiError, chatJson } from './openrouter.js';
import { log, secondsSince } from './log.js';
import {
  fetchPackageData,
  type PackageData,
  type SourceName,
  type SourceResult,
} from './packageData.js';
import { pages } from './sources.js';

// READMEs are the bulk of the prompt; a cap keeps the cost per request bounded.
const README_MAX_CHARS = 4000;

// The model names the package and field; source and fetch date are filled in from the
// fetched data, so the model cannot get them wrong.
const evidenceSchema = z.object({ package: z.string(), field: z.string() });
const claimSchema = z.object({ text: z.string(), evidence: z.array(evidenceSchema).min(1) });
const statusSchema = z.enum(['ok', 'warning', 'danger']);
// A ranking needs at least one pro and a rejection at least one con, so each position is explained
// by cited data.
const rankedSchema = z.object({
  name: z.string(),
  pros: z.array(claimSchema).min(1),
  cons: z.array(claimSchema),
});
const rejectedSchema = z.object({
  name: z.string(),
  pros: z.array(claimSchema),
  cons: z.array(claimSchema).min(1),
});

const comparisonSchema = z.object({
  ranking: z.array(rankedSchema),
  rejected: z.array(rejectedSchema),
  summary: claimSchema.nullable(),
  security: z.array(
    z.object({
      name: z.string(),
      license: statusSchema,
      dependencyCount: statusSchema,
      releaseActivity: statusSchema,
    }),
  ),
});
type Comparison = z.infer<typeof comparisonSchema>;
type ModelClaim = z.infer<typeof claimSchema>;
type Statuses = Comparison['security'][number];

const SYSTEM_PROMPT = `You compare npm packages for a developer's need, using only the package data given.
Rank the packages that fit the need, best first, and list the others as rejected.
Each package goes in exactly one of the two lists: never both, never neither.
Give every package pros and cons for this need: at least one pro for a ranked package and at least
one con for a rejected one.
Write a summary of one or two sentences on why the first ranked package suits the need best,
compared with the second ranked one when there is one. The summary is null only when no package
is ranked.
For every package, give a status of ok, warning or danger for its license (npm.license), its
dependency count (dependencies.total) and its release activity (npm.versionReleaseDate and
npm.releasesLastYear).

The report already shows these facts for every package, so pros, cons and the summary do not
restate them: license, known vulnerabilities, maintainers, dependency count, release date, weekly
downloads and stars. A fact may appear only to compare the packages ("the most weekly downloads
of the candidates"), or in a con that says what a weakness is: a license, dependency count or
release activity you rated warning or danger, or known vulnerabilities ("No release since
2024-12-11; 0 releases in the last year"). Otherwise use what sets a package apart for this need:
what its description and README say it does, peer dependencies, types, deprecation, an archived
repository, unpacked size.

Rules:
- Every claim must cite one or more fields as evidence: the package name and the field path as it
  appears in the data, for example "npm.license", "downloads.weekly" or "github.unavailable".
- Each claim states only the values of the fields it cites: numbers, dates, names, ranges.
- Do not add judgements, causes or consequences the data does not state. Avoid words such as
  very, active, actively maintained, strong, solid, good, healthy, mature, popular, community,
  adoption, usage, lightweight, attack surface, ideal, manageable.
- Never write the statuses ok, warning or danger in claim text; they belong in the status fields.
- Do not bring in facts that are not in the data, such as current framework versions.
- Do not write field paths in the claim text; they belong in the evidence only.
- A field group marked unavailable has no data; cite its "unavailable" field and say the data is
  unavailable.

Examples of claim text:
- Write "Exports QRCodeSVG and QRCodeCanvas components", not "Feature-rich".
- Write "41,771,731 weekly downloads, the most of the candidates", not "Strong community adoption".
- Write "Peer dependency react ^0.14 || ^15", not "Not compatible with modern React".
- Write "Marked as deprecated on npm", not "Abandoned".
- Write "Ships TypeScript types (index.d.ts)", not "Great developer experience".`;

const GROUPS = [
  'npm',
  'readme',
  'downloads',
  'dependencies',
  'project',
  'vulnerabilities',
  'github',
] as const satisfies Exclude<keyof PackageData, 'name' | 'version'>[];
type Group = (typeof GROUPS)[number];

// What the model sees for one package, per source group: its data, or the reason it is
// unavailable. Evidence references are checked against these same fields.
function promptFields(pkg: PackageData) {
  const fields: Record<string, object> = {};
  for (const group of GROUPS) {
    const result = pkg[group];
    fields[group] = 'data' in result ? result.data : { unavailable: result.unavailable };
  }
  if ('data' in pkg.readme) {
    fields.readme = { text: pkg.readme.data.text.slice(0, README_MAX_CHARS) };
  }
  return fields;
}

function userPrompt({ need, framework }: ReportRequest, packages: PackageData[]): string {
  const data = packages.map((pkg) => ({
    name: pkg.name,
    version: pkg.version,
    ...promptFields(pkg),
  }));
  return [`Need: ${need}`, `Framework: ${framework}`, 'Packages:', JSON.stringify(data)].join('\n');
}

function wasFetched(ref: ModelClaim['evidence'][number], packages: Map<string, PackageData>) {
  const pkg = packages.get(ref.package);
  const [group = '', key = ''] = ref.field.split('.', 2);
  const fields = pkg && promptFields(pkg)[group];
  return fields !== undefined && key in fields;
}

// Every package name and evidence reference in the model output that does not match the
// fetched data. All are collected so one rejected report shows every problem.
function invalidReferences(comparison: Comparison, packages: Map<string, PackageData>): string[] {
  const entries = [...comparison.ranking, ...comparison.rejected];
  const claims = [
    ...entries.flatMap((e) => [...e.pros, ...e.cons]),
    ...(comparison.summary ? [comparison.summary] : []),
  ];
  return [
    ...[...entries, ...comparison.security]
      .filter((e) => !packages.has(e.name))
      .map((e) => `package ${e.name}`),
    ...claims
      .flatMap((c) => c.evidence)
      .filter((ref) => !wasFetched(ref, packages))
      .map((ref) => `field ${ref.package} ${ref.field}`),
  ];
}

// The prompt asks for every package to be ranked or rejected exactly once, each with a security
// summary, and for a summary of rank 1; an answer that skips or repeats any is not complete.
function missingCoverage(comparison: Comparison, packages: PackageData[]): string[] {
  const listed = [...comparison.ranking, ...comparison.rejected].map((e) => e.name);
  const summarized = new Set(comparison.security.map((s) => s.name));
  return packages
    .flatMap(({ name }) => {
      const times = listed.filter((n) => n === name).length;
      return [
        ...(times === 0 ? [`${name} is neither ranked nor rejected`] : []),
        ...(times > 1 ? [`${name} is listed ${times} times`] : []),
        ...(summarized.has(name) ? [] : [`${name} has no security summary`]),
      ];
    })
    .concat(comparison.ranking.length > 0 && !comparison.summary ? ['no summary for rank 1'] : []);
}

// References are already checked by invalidReferences(), so every lookup succeeds.
function resolveClaim(claim: ModelClaim, packages: Map<string, PackageData>): Claim {
  const evidence = claim.evidence.map((ref) => {
    const [group] = ref.field.split('.', 1);
    const { source, page, fetchedAt } = packages.get(ref.package)![group as Group];
    return { package: ref.package, field: ref.field, source, url: page, fetchedAt };
  });
  return { text: claim.text, evidence };
}

function buildReport(
  request: ReportRequest,
  packageList: PackageData[],
  packages: Map<string, PackageData>,
  comparison: Comparison,
): Report {
  const claims = (list: ModelClaim[]) => list.map((claim) => resolveClaim(claim, packages));
  const entry = ({ name, pros, cons }: Comparison['ranking'][number]) => ({
    name,
    version: packages.get(name)!.version,
    repository: repository(packages.get(name)!),
    description: description(packages.get(name)!),
    pros: claims(pros),
    cons: claims(cons),
  });

  return {
    need: request.need,
    framework: request.framework,
    generatedAt: new Date().toISOString(),
    summary: comparison.summary && resolveClaim(comparison.summary, packages),
    ranking: comparison.ranking.map((e, i) => ({ rank: i + 1, ...entry(e) })),
    rejected: comparison.rejected.map(entry),
    security: comparison.security.map((s) => ({
      name: s.name,
      version: packages.get(s.name)!.version,
      ...codeFacts(packages.get(s.name)!, s),
    })),
    sources: dataSources(packageList),
  };
}

function repository(pkg: PackageData): string | null {
  const repo = 'data' in pkg.npm ? pkg.npm.data.githubRepo : null;
  return repo ? pages.github(repo) : null;
}

function description(pkg: PackageData): string | null {
  return 'data' in pkg.npm ? pkg.npm.data.description : null;
}

// Facts are written by code from the fetched fields, so their wording is exact. The model only
// picks the status of license, dependency count and release activity.
function codeFacts(pkg: PackageData, statuses: Statuses) {
  return {
    license: codeFact(pkg.name, 'npm', pkg.npm, 'license', (d) => ({
      text: d.license ?? 'none declared',
      status: statuses.license,
    })),
    dependencyCount: codeFact(pkg.name, 'dependencies', pkg.dependencies, 'total', (d) => ({
      text: String(d.total),
      status: statuses.dependencyCount,
    })),
    releaseActivity: codeFact(pkg.name, 'npm', pkg.npm, 'versionReleaseDate', (d) => ({
      text: d.versionReleaseDate?.slice(0, 10) ?? 'unknown',
      status: statuses.releaseActivity,
    })),
    vulnerabilities: codeFact(pkg.name, 'vulnerabilities', pkg.vulnerabilities, 'known', (d) => ({
      text: `${d.known.length} known`,
      status: d.known.length === 0 ? 'ok' : 'danger',
    })),
    maintainers: codeFact(pkg.name, 'npm', pkg.npm, 'maintainers', (d) => ({
      text: d.maintainers.length === 1 ? d.maintainers[0]! : String(d.maintainers.length),
    })),
    weeklyDownloads: codeFact(pkg.name, 'downloads', pkg.downloads, 'weekly', (d) => ({
      text: d.weekly.toLocaleString('en-US'),
    })),
    stars: codeFact(pkg.name, 'github', pkg.github, 'stars', (d) => ({
      text: d.stars.toLocaleString('en-US'),
    })),
  };
}

// A fact from one fetched field, or 'unavailable' citing the reason when its source failed.
function codeFact<T>(
  name: string,
  group: Group,
  result: SourceResult<T>,
  key: string,
  describe: (data: T) => Pick<SecurityCheck, 'text' | 'status'>,
): SecurityCheck {
  const { source, page, fetchedAt } = result;
  const evidence = (field: string) => [
    { package: name, field: `${group}.${field}`, source, url: page, fetchedAt },
  ];
  return 'data' in result
    ? { ...describe(result.data), evidence: evidence(key) }
    : { text: 'unavailable', evidence: evidence('unavailable') };
}

const SITES: Record<SourceName, string> = {
  npm: 'https://www.npmjs.com',
  'deps.dev': 'https://deps.dev',
  OSV: 'https://osv.dev',
  GitHub: 'https://github.com',
  jsDelivr: 'https://www.jsdelivr.com',
};

// One entry per source that returned data, with its earliest fetch date.
function dataSources(packages: PackageData[]): DataSource[] {
  const earliest = new Map<SourceName, string>();
  for (const result of packages.flatMap((pkg) => GROUPS.map((group) => pkg[group]))) {
    const seen = earliest.get(result.source);
    if ('data' in result && (!seen || result.fetchedAt < seen)) {
      earliest.set(result.source, result.fetchedAt);
    }
  }
  return [...earliest].map(([name, fetchedAt]) => ({ name, url: SITES[name], fetchedAt }));
}

export async function compareCandidates(
  request: ReportRequest,
  packages: PackageData[],
): Promise<Report> {
  const comparison = await chatJson(
    'comparison',
    comparisonSchema,
    SYSTEM_PROMPT,
    userPrompt(request, packages),
  );
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const invalid = invalidReferences(comparison, byName);
  if (invalid.length > 0) {
    throw new AiError(
      'comparison',
      `Model cited data that was not fetched: ${invalid.join(', ')}`,
      JSON.stringify(comparison),
    );
  }
  const missing = missingCoverage(comparison, packages);
  if (missing.length > 0) {
    throw new AiError(
      'comparison',
      `Model output is incomplete: ${missing.join(', ')}`,
      JSON.stringify(comparison),
    );
  }
  return buildReport(request, packages, byName, comparison);
}

// The whole pipeline: exactly two AI calls, no retries, nothing stored.
export async function generateReport(request: ReportRequest): Promise<Report> {
  const candidates = await findCandidates(request);
  const start = performance.now();
  const packages = await Promise.all(candidates.map(fetchPackageData));
  log(
    `data fetched for ${packages.length} candidates in ${secondsSince(start)}; failed sources: ${failedSources(packages).join(', ') || 'none'}`,
  );
  return compareCandidates(request, packages);
}

function failedSources(packages: PackageData[]): string[] {
  return packages.flatMap((pkg) =>
    GROUPS.flatMap((group) => {
      const result = pkg[group];
      return 'unavailable' in result ? [`${pkg.name} ${group} (${result.unavailable})`] : [];
    }),
  );
}
