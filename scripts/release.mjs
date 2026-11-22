// Merges a pull request whose checks all passed (or picks up one already merged), then watches the
// deploy that Cloud Build reports on the merge commit and prints its steps, the smoke test results
// and whether the release is live. Needs gh, and gcloud signed in to the project for the details.
// Usage: pnpm release [pull request number]; defaults to the current branch's pull request.
import { execFileSync, execSync, spawnSync } from 'node:child_process';
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
// A merge of only ignored files gets a neutral check run ("Changed files did not match file filter").
if (!deploy || deploy.conclusion === 'neutral') {
  console.log('No deploy started: only files the trigger ignores changed.');
} else {
  printBuild(deploy.details_url.match(/builds\/([0-9a-f-]{36})/)[1]);
  if (deploy.conclusion === 'success') {
    console.log('Live: the smoke test passed and the new revision gets all traffic.');
  } else {
    // A failure before Promote (usually Smoke) leaves users on the previous version.
    console.log('Deploy failed at the step marked FAILURE above.');
    process.exitCode = 1;
  }
  console.log(deploy.details_url);
}

run('git', ['switch', 'master']);
run('git', ['pull']);

// The deploy is the google-cloud-build check run on the merge commit. If none appears within a
// few minutes, the trigger did not run.
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

// Steps that did not run (after a failure) are QUEUED with no timing.
function printBuild(id) {
  const build = JSON.parse(gcloud(`builds describe ${id} --region=global --format=json`));
  for (const step of build.steps) {
    const time = step.timing ? duration(step.timing) : '';
    console.log(`${step.id.padEnd(20)}${step.status.padEnd(9)}${time}`);
    if (step.id === 'Smoke') smokeResults(id).forEach((line) => console.log(`  ${line}`));
  }
  console.log(`Total ${duration({ startTime: build.startTime, endTime: build.finishTime })}`);
}

// Playwright's summary ("2 passed (49.8s)", "1 failed") and failing tests, from the build log. Its
// "›" and "─" arrive as "?" in the log, so a failing test is rebuilt as "1) title (file:line)".
function smokeResults(id) {
  return gcloud(`builds log ${id} --region=global`)
    .split('\n')
    .filter((line) => line.startsWith('Step #') && line.includes('"Smoke":'))
    .map((line) => line.slice(line.indexOf(':') + 1).trim())
    .map((line) => line.replace(/^(\d+\)) (\S+) \S (.+?)[\s?─]*$/, '$1 $3 ($2)'))
    .filter((line) => /^\d+ (passed|failed|flaky)|^\d+\) /.test(line));
}

function duration({ startTime, endTime }) {
  const seconds = Math.round((Date.parse(endTime) - Date.parse(startTime)) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

// gcloud is a .cmd file on Windows, so it needs a shell; its arguments here are fixed or a build
// id. The log of a build is a few MB.
function gcloud(args) {
  return execSync(`gcloud ${args}`, { encoding: 'utf8', maxBuffer: 50_000_000 });
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
