// Merges a pull request whose checks all passed (or picks up one already merged), then watches the
// deploy that Cloud Build reports on the merge commit and says whether the release is live.
// Usage: pnpm release [pull request number]; defaults to the current branch's pull request.
import { execFileSync, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// The merge and the end of the script switch to master, which local changes can block after the
// merge already happened.
if (read('git', ['status', '--porcelain'])) stop('Commit or stash local changes first.');

let pr = prView(process.argv[2]);
const number = String(pr.number);
if (pr.state === 'CLOSED') stop(`${pr.url} is closed without a merge.`);
if (pr.state === 'OPEN') {
  // gh exits non-zero while a check is pending (8) or failed, with the JSON still on stdout.
  const output = spawnSync('gh', ['pr', 'checks', number, '--json', 'name,bucket'], {
    encoding: 'utf8',
  }).stdout;
  const checks = JSON.parse(output || '[]');
  const notPassed = checks.filter((check) => !['pass', 'skipping'].includes(check.bucket));
  if (checks.length === 0 || notPassed.length > 0) {
    stop(
      `Not merged: checks not passed (${notPassed.map((c) => `${c.name} ${c.bucket}`).join(', ') || 'none reported'}).`,
    );
  }
  run('gh', ['pr', 'merge', number, '--squash', '--delete-branch']);
  pr = prView(number);
}

const sha = pr.mergeCommit.oid;
console.log(`Merged as ${sha.slice(0, 7)}. Waiting for the deploy...`);
const deploy = await watchDeploy(sha);
if (!deploy) {
  console.log('No deploy started: only files the trigger ignores changed.');
} else if (deploy.conclusion === 'success') {
  console.log(
    `Live: the smoke test passed and the new revision gets all traffic.\n${deploy.details_url}`,
  );
} else {
  // A failure before Promote (usually Smoke) leaves users on the previous version; the log says
  // which step failed.
  console.log(`Deploy failed; see the build log for the failed step.\n${deploy.details_url}`);
  process.exitCode = 1;
}

run('git', ['switch', 'master']);
run('git', ['pull']);

// The deploy is the google-cloud-build check run on the merge commit. If none appears within a
// few minutes, the trigger skipped the commit.
async function watchDeploy(commit) {
  for (let waited = 0; ; waited += 15) {
    const runs = JSON.parse(
      read('gh', [
        'api',
        `repos/{owner}/{repo}/commits/${commit}/check-runs`,
        '--jq',
        '[.check_runs[] | select(.app.slug == "google-cloud-build")]',
      ]),
    );
    const deploy = runs[0];
    if (deploy?.status === 'completed') return deploy;
    if (!deploy && waited >= 180) return undefined;
    await sleep(15_000);
  }
}

// No number: the pull request of the current branch.
function prView(number) {
  const args = number ? [number] : [];
  return JSON.parse(read('gh', ['pr', 'view', ...args, '--json', 'number,state,mergeCommit,url']));
}

function read(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

function stop(message) {
  console.error(message);
  process.exit(1);
}
