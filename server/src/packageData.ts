import type { Candidate } from './candidates.js';
import {
  fetchDependencyCount,
  fetchGithub,
  fetchNpm,
  fetchProject,
  fetchReadme,
  fetchVulnerabilities,
  fetchWeeklyDownloads,
  urls,
  type GithubData,
  type NpmData,
  type ProjectData,
  type Vulnerability,
} from './sources.js';

export type SourceName =
  'npm registry' | 'npm downloads' | 'deps.dev' | 'OSV' | 'GitHub' | 'jsDelivr';

// Every field in a group shares its source, URL and fetch date. A failed source keeps the
// same shape with the reason instead of data, so the report can show it as unavailable.
export type SourceResult<T> = { source: SourceName; url: string; fetchedAt: string } & (
  { data: T } | { unavailable: string }
);

export interface PackageData {
  name: string;
  version: string;
  npm: SourceResult<Omit<NpmData, 'readme'>>;
  readme: SourceResult<{ text: string }>;
  downloads: SourceResult<{ weekly: number }>;
  dependencies: SourceResult<{ total: number }>;
  project: SourceResult<ProjectData>;
  vulnerabilities: SourceResult<{ known: Vulnerability[] }>;
  github: SourceResult<GithubData>;
}

async function settle<T>(
  source: SourceName,
  url: string,
  fetcher: () => Promise<T>,
): Promise<SourceResult<T>> {
  try {
    const data = await fetcher();
    return { source, url, fetchedAt: new Date().toISOString(), data };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { source, url, fetchedAt: new Date().toISOString(), unavailable: reason };
  }
}

// The URL is the npm document, where the missing repository was looked up.
function noRepo<T>(source: SourceName, name: string): SourceResult<T> {
  return {
    source,
    url: urls.npm(name),
    fetchedAt: new Date().toISOString(),
    unavailable: 'No GitHub repository in the npm metadata',
  };
}

export async function fetchPackageData({ name, version }: Candidate): Promise<PackageData> {
  const [npm, downloads, dependencies, vulnerabilities] = await Promise.all([
    settle('npm registry', urls.npm(name), () => fetchNpm(name, version, new Date())),
    settle('npm downloads', urls.downloads(name), async () => ({
      weekly: await fetchWeeklyDownloads(name),
    })),
    settle('deps.dev', urls.dependencies(name, version), async () => ({
      total: await fetchDependencyCount(name, version),
    })),
    settle('OSV', urls.osv, async () => ({ known: await fetchVulnerabilities(name, version) })),
  ]);

  // The repository comes from the npm metadata, so these two wait for it.
  const repo = 'data' in npm ? npm.data.githubRepo : null;
  const [project, github] = repo
    ? await Promise.all([
        settle('deps.dev', urls.project(repo), () => fetchProject(repo)),
        settle('GitHub', urls.github(repo), () => fetchGithub(repo)),
      ])
    : [noRepo<ProjectData>('deps.dev', name), noRepo<GithubData>('GitHub', name)];

  const [npmFields, readme] = await splitReadme(name, version, npm);
  return {
    name,
    version,
    npm: npmFields,
    readme,
    downloads,
    dependencies,
    project,
    vulnerabilities,
    github,
  };
}

// The README is its own group because it can come from npm or, when npm's copy is empty,
// from the published package files on jsDelivr.
async function splitReadme(
  name: string,
  version: string,
  npm: SourceResult<NpmData>,
): Promise<[SourceResult<Omit<NpmData, 'readme'>>, SourceResult<{ text: string }>]> {
  if (!('data' in npm)) {
    return [npm, await settle('jsDelivr', urls.readme(name, version), readmeText(name, version))];
  }
  const { readme, ...fields } = npm.data;
  const npmFields = { ...npm, data: fields };
  if (readme) return [npmFields, { ...npm, data: { text: readme } }];
  return [
    npmFields,
    await settle('jsDelivr', urls.readme(name, version), readmeText(name, version)),
  ];
}

function readmeText(name: string, version: string) {
  return async () => ({ text: await fetchReadme(name, version) });
}
