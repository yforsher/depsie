import type { Claim, DataSource, Report, ReportRequest } from 'shared';
import * as z from 'zod';
import { findCandidates } from './candidates.js';
import { AiError, chatJson } from './openrouter.js';
import { fetchPackageData, type PackageData } from './packageData.js';

// READMEs are the bulk of the prompt; a cap keeps the cost per request bounded.
const README_MAX_CHARS = 4000;

// The model names the package and field; source and fetch date are filled in from the
// fetched data, so the model cannot get them wrong.
const evidenceSchema = z.object({ package: z.string(), field: z.string() });
const claimSchema = z.object({ text: z.string(), evidence: z.array(evidenceSchema).min(1) });
const checkSchema = claimSchema.extend({ status: z.enum(['ok', 'warning', 'danger']) });
const entrySchema = z.object({ name: z.string(), reasons: z.array(claimSchema) });

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
Give a security and compliance summary for every package: license, known vulnerabilities,
maintainers, dependency count and release activity, each with status ok, warning or danger.

Rules:
- Every claim must cite one or more fields as evidence: the package name and the field path as it
  appears in the data, for example "npm.license", "downloads.weekly" or "github.unavailable".
- Only state what the cited fields show. Give dates and numbers instead of judgements: write
  "last release on 2026-03-01", not "actively maintained".
- A field group marked unavailable has no data; cite its "unavailable" field and say the data is
  unavailable.`;

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

// Builds the final claim, rejecting any reference to a package or field that was not fetched.
function resolveClaim(claim: ModelClaim, packages: Map<string, PackageData>): Claim {
  const evidence = claim.evidence.map((ref) => {
    const pkg = packages.get(ref.package);
    const [group = '', key = ''] = ref.field.split('.', 2);
    const fields = pkg && promptFields(pkg)[group];
    if (!pkg || !fields || !(key in fields)) {
      throw new AiError(`Model cited a field that was not fetched: ${ref.package} ${ref.field}`);
    }
    const { source, fetchedAt } = pkg[group as Group];
    return { package: ref.package, field: ref.field, source, fetchedAt };
  });
  return { text: claim.text, evidence };
}

function packageFor(name: string, packages: Map<string, PackageData>): PackageData {
  const pkg = packages.get(name);
  if (!pkg) throw new AiError(`Model named a package that was not fetched: ${name}`);
  return pkg;
}

function buildReport(
  request: ReportRequest,
  packageList: PackageData[],
  comparison: Comparison,
): Report {
  const packages = new Map(packageList.map((pkg) => [pkg.name, pkg]));
  const claims = (list: ModelClaim[]) => list.map((claim) => resolveClaim(claim, packages));
  const check = (c: Comparison['security'][number]['license']) => ({
    status: c.status,
    ...resolveClaim(c, packages),
  });
  const entry = ({ name, reasons }: Comparison['ranking'][number]) => ({
    name,
    version: packageFor(name, packages).version,
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
      version: packageFor(s.name, packages).version,
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
    url: pkg[group].url,
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
  return buildReport(request, packages, comparison);
}

// The whole pipeline: exactly two AI calls, no retries, nothing stored.
export async function generateReport(request: ReportRequest): Promise<Report> {
  const candidates = await findCandidates(request);
  const packages = await Promise.all(candidates.map(fetchPackageData));
  return compareCandidates(request, packages);
}
