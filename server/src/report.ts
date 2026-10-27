import type { Claim, DataSource, Report, ReportRequest } from 'shared';
import * as z from 'zod';
import { findCandidates } from './candidates.js';
import { AiError, chatJson } from './openrouter.js';
import { log, secondsSince } from './log.js';
import { fetchPackageData, type PackageData } from './packageData.js';

// READMEs are the bulk of the prompt; a cap keeps the cost per request bounded.
const README_MAX_CHARS = 4000;

// The model names the package and field; source and fetch date are filled in from the
// fetched data, so the model cannot get them wrong.
const evidenceSchema = z.object({ package: z.string(), field: z.string() });
const claimSchema = z.object({ text: z.string(), evidence: z.array(evidenceSchema).min(1) });
const checkSchema = claimSchema.extend({ status: z.enum(['ok', 'warning', 'danger']) });
// A ranking or rejection must cite data like any other claim, so it needs at least one reason.
const entrySchema = z.object({ name: z.string(), reasons: z.array(claimSchema).min(1) });

const comparisonSchema = z.object({
  ranking: z.array(entrySchema),
  rejected: z.array(entrySchema),
  security: z.array(
    z.object({
      name: z.string(),
      license: checkSchema,
      vulnerabilities: checkSchema,
      maintainers: checkSchema,
      dependencyCount: checkSchema,
      releaseActivity: checkSchema,
    }),
  ),
});
type Comparison = z.infer<typeof comparisonSchema>;
type ModelClaim = z.infer<typeof claimSchema>;

const SYSTEM_PROMPT = `You compare npm packages for a developer's need, using only the package data given.
Rank the packages that fit the need, best first, and list the others as rejected with the reasons.
Each package goes in exactly one of the two lists: never both, never neither.
Give a security and compliance summary for every package: license, known vulnerabilities,
maintainers, dependency count and release activity, each with status ok, warning or danger.

Rules:
- Every claim must cite one or more fields as evidence: the package name and the field path as it
  appears in the data, for example "npm.license", "downloads.weekly" or "github.unavailable".
- Each claim states only the values of the fields it cites: numbers, dates, names, ranges.
  Comparing those values between the packages given is fine ("the most of the candidates").
- Do not add judgements, causes or consequences the data does not state. Avoid words such as
  very, active, actively maintained, strong, solid, good, healthy, mature, popular, community,
  adoption, lightweight, attack surface, ideal, manageable.
- Do not bring in facts that are not in the data, such as current framework versions.
- Do not write field paths in the claim text; they belong in the evidence only.
- A field group marked unavailable has no data; cite its "unavailable" field and say the data is
  unavailable.

Examples of claim text:
- Write "Last release on 2026-09-30; 18 releases in the last year", not "Very active development".
- Write "41,771,731 weekly downloads, the most of the candidates", not "Strong community adoption".
- Write "2 direct dependencies", not "Small dependency footprint that reduces attack surface".
- Write "Peer dependency react ^0.14 || ^15", not "Not compatible with modern React".`;

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
    ...entries.flatMap((e) => e.reasons),
    ...comparison.security.flatMap((s) => [
      s.license,
      s.vulnerabilities,
      s.maintainers,
      s.dependencyCount,
      s.releaseActivity,
    ]),
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
// summary; an answer that skips or repeats packages is not a complete comparison.
function missingCoverage(comparison: Comparison, packages: PackageData[]): string[] {
  const listed = [...comparison.ranking, ...comparison.rejected].map((e) => e.name);
  const summarized = new Set(comparison.security.map((s) => s.name));
  return packages.flatMap(({ name }) => {
    const times = listed.filter((n) => n === name).length;
    return [
      ...(times === 0 ? [`${name} is neither ranked nor rejected`] : []),
      ...(times > 1 ? [`${name} is listed ${times} times`] : []),
      ...(summarized.has(name) ? [] : [`${name} has no security summary`]),
    ];
  });
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
  const check = (c: Comparison['security'][number]['license']) => ({
    status: c.status,
    ...resolveClaim(c, packages),
  });
  const entry = ({ name, reasons }: Comparison['ranking'][number]) => ({
    name,
    version: packages.get(name)!.version,
    reasons: claims(reasons),
  });

  return {
    need: request.need,
    framework: request.framework,
    generatedAt: new Date().toISOString(),
    ranking: comparison.ranking.map((e, i) => ({ rank: i + 1, ...entry(e) })),
    rejected: comparison.rejected.map(entry),
    security: comparison.security.map((s) => ({
      name: s.name,
      version: packages.get(s.name)!.version,
      license: check(s.license),
      vulnerabilities: check(s.vulnerabilities),
      maintainers: check(s.maintainers),
      dependencyCount: check(s.dependencyCount),
      releaseActivity: check(s.releaseActivity),
    })),
    sources: packageList.flatMap(dataSources),
  };
}

function dataSources(pkg: PackageData): DataSource[] {
  return GROUPS.map((group) => ({
    name: `${pkg[group].source} for ${pkg.name}@${pkg.version}`,
    url: pkg[group].page,
    fetchedAt: pkg[group].fetchedAt,
  }));
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
