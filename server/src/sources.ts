// One fetcher per outside source. Each returns plain data and throws on any failure;
// packageData.ts turns a failure into an unavailable source instead of a failed request.

const TIMEOUT_MS = 10_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} returned status ${res.status}`);
  return res;
}

async function getJson(url: string, init: RequestInit = {}): Promise<unknown> {
  return (await get(url, init)).json();
}

export const urls = {
  npm: (name: string) => `https://registry.npmjs.org/${name}`,
  downloads: (name: string) => `https://api.npmjs.org/downloads/point/last-week/${name}`,
  dependencies: (name: string, version: string) =>
    `https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(name)}/versions/${version}:dependencies`,
  project: (repo: string) =>
    `https://api.deps.dev/v3/projects/${encodeURIComponent(`github.com/${repo}`)}`,
  osv: 'https://api.osv.dev/v1/query',
  github: (repo: string) => `https://api.github.com/repos/${repo}`,
  // The README.md inside the published package, for when npm's metadata has none.
  readme: (name: string, version: string) =>
    `https://cdn.jsdelivr.net/npm/${name}@${version}/README.md`,
};

// The human-readable page for each source's data, which the report links to instead of the
// API response. The npm page also shows weekly downloads.
export const pages = {
  npm: (name: string, version: string) => `https://www.npmjs.com/package/${name}/v/${version}`,
  dependencies: (name: string, version: string) =>
    `https://deps.dev/npm/${encodeURIComponent(name)}/${version}`,
  project: (repo: string) => `https://deps.dev/project/github/${encodeURIComponent(repo)}`,
  osv: (name: string) => `https://osv.dev/list?ecosystem=npm&q=${encodeURIComponent(name)}`,
  github: (repo: string) => `https://github.com/${repo}`,
  readme: (name: string, version: string) =>
    `https://www.jsdelivr.com/package/npm/${name}?version=${version}`,
};

export interface NpmData {
  description: string | null;
  license: string | null;
  maintainers: string[];
  directDependencies: number;
  peerDependencies: Record<string, string>;
  // The package.json "types" or "typings" entry; null when the package declares none.
  types: string | null;
  unpackedSize: number | null;
  deprecated: string | null;
  firstReleaseDate: string;
  versionReleaseDate: string | null;
  releasesLastYear: number;
  // Empty for some packages even when the published files include a README.
  readme: string;
  // "owner/repo" from the repository field, when it points at GitHub.
  githubRepo: string | null;
}

interface Packument {
  description?: string;
  maintainers?: { name: string }[];
  readme?: string;
  time: { created: string } & Record<string, string>;
  versions: Record<string, VersionDoc>;
  repository?: string | { url?: string };
}

interface VersionDoc {
  license?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  types?: string;
  typings?: string;
  deprecated?: string;
  dist?: { unpackedSize?: number };
}

export function parseGithubRepo(repository: Packument['repository']): string | null {
  const url = typeof repository === 'string' ? repository : repository?.url;
  const match = url?.match(/github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?(?:[/#]|$)/);
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function fetchNpm(name: string, version: string, now: Date): Promise<NpmData> {
  const doc = (await getJson(urls.npm(name))) as Packument;
  const v = doc.versions[version];
  if (!v) throw new Error(`Version ${version} not found in npm metadata for ${name}`);

  const releaseDates = Object.entries(doc.time)
    .filter(([key]) => key in doc.versions)
    .map(([, date]) => date);
  return {
    description: doc.description ?? null,
    license: v.license ?? null,
    maintainers: (doc.maintainers ?? []).map((m) => m.name),
    directDependencies: Object.keys(v.dependencies ?? {}).length,
    peerDependencies: v.peerDependencies ?? {},
    types: v.types ?? v.typings ?? null,
    unpackedSize: v.dist?.unpackedSize ?? null,
    deprecated: v.deprecated ?? null,
    firstReleaseDate: doc.time.created,
    versionReleaseDate: doc.time[version] ?? null,
    releasesLastYear: releaseDates.filter((date) => now.getTime() - Date.parse(date) < YEAR_MS)
      .length,
    readme: doc.readme ?? '',
    githubRepo: parseGithubRepo(doc.repository),
  };
}

export async function fetchReadme(name: string, version: string): Promise<string> {
  return (await get(urls.readme(name, version))).text();
}

export async function fetchWeeklyDownloads(name: string): Promise<number> {
  const data = (await getJson(urls.downloads(name))) as { downloads: number };
  return data.downloads;
}

// Total dependencies, direct and transitive, from the resolved graph (minus the package itself).
export async function fetchDependencyCount(name: string, version: string): Promise<number> {
  const data = (await getJson(urls.dependencies(name, version))) as { nodes: unknown[] };
  return data.nodes.length - 1;
}

export interface ProjectData {
  stars: number;
  openIssues: number;
  scorecardScore: number | null;
  scorecardDate: string | null;
}

export async function fetchProject(repo: string): Promise<ProjectData> {
  const data = (await getJson(urls.project(repo))) as {
    starsCount: number;
    openIssuesCount: number;
    scorecard?: { overallScore: number; date: string };
  };
  return {
    stars: data.starsCount,
    openIssues: data.openIssuesCount,
    scorecardScore: data.scorecard?.overallScore ?? null,
    scorecardDate: data.scorecard?.date ?? null,
  };
}

export interface Vulnerability {
  id: string;
  summary: string;
  severity: string | null;
  aliases: string[];
}

export async function fetchVulnerabilities(
  name: string,
  version: string,
): Promise<Vulnerability[]> {
  const data = (await getJson(urls.osv, {
    method: 'POST',
    body: JSON.stringify({ package: { name, ecosystem: 'npm' }, version }),
  })) as {
    vulns?: {
      id: string;
      summary?: string;
      aliases?: string[];
      database_specific?: { severity?: string };
    }[];
  };
  return (data.vulns ?? []).map((v) => ({
    id: v.id,
    summary: v.summary ?? '',
    severity: v.database_specific?.severity ?? null,
    aliases: v.aliases ?? [],
  }));
}

export interface GithubData {
  lastPush: string;
  archived: boolean;
}

export async function fetchGithub(repo: string): Promise<GithubData> {
  const token = process.env.GITHUB_TOKEN;
  const data = (await getJson(urls.github(repo), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })) as { pushed_at: string; archived: boolean };
  return { lastPush: data.pushed_at, archived: data.archived };
}
