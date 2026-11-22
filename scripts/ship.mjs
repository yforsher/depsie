// Takes local changes to an open pull request with its CI results: branch, lint and test, commit,
// push, pull request, watch checks. It never merges (that is `pnpm release`). Node, not a shell
// script, so it runs the same on Windows, macOS and Linux.
// Usage: pnpm ship -m "message" [-b branch-name]
import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { message: { type: 'string', short: 'm' }, branch: { type: 'string', short: 'b' } },
});
if (!values.message) stop('Usage: pnpm ship -m "message" [-b branch-name]');

// Not read(): its trim would drop the leading space of the first " M" line.
const changes = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trimEnd();
if (!changes) stop('Nothing to commit.');

console.log(`Changes to commit:\n${changes}\n`);
if (!(await confirm('Commit all of these? (y/N) '))) stop('Stopped, nothing committed.');

// pnpm is a .cmd file on Windows, so it needs a shell; these commands take no user input.
for (const script of ['lint', 'test']) {
  if (spawnSync(`pnpm ${script}`, { stdio: 'inherit', shell: true }).status !== 0) {
    stop(`pnpm ${script} failed, nothing committed.`);
  }
}

// Only now, so a stop above leaves the developer on the branch they started from.
if (read('git', ['branch', '--show-current']) === 'master') {
  run('git', ['switch', '-c', values.branch ?? slug(values.message)]);
}

run('git', ['add', '--all']);
run('git', ['commit', '-m', values.message]);
run('git', ['push', '--set-upstream', 'origin', 'HEAD']);

// A push already updates an open pull request, so open one only when the branch has none open
// (gh also finds a merged or closed one, and new commits there need a new pull request).
if (prField('state') !== 'OPEN') run('gh', ['pr', 'create', '--fill']);

// The pull request reaches the pushed commit and its checks a few seconds after the push; watching
// before then ends at once with "no checks reported" or the previous commit's results.
const head = read('git', ['rev-parse', 'HEAD']);
while (prField('headRefOid') !== head || !prChecks()) await sleep(5_000);
const passed = spawnSync('gh', ['pr', 'checks', '--watch'], { stdio: 'inherit' }).status === 0;
const url = read('gh', ['pr', 'view', '--json', 'url', '--jq', '.url']);
console.log(`\n${url}\n${passed ? 'All checks passed.' : 'Some checks failed.'}`);
process.exitCode = passed ? 0 : 1;

// Empty when the branch has no pull request.
function prField(field) {
  const args = ['pr', 'view', '--json', field, '--jq', `.${field}`];
  return spawnSync('gh', args, { encoding: 'utf8' }).stdout.trim();
}

function prChecks() {
  return spawnSync('gh', ['pr', 'checks', '--json', 'name'], { encoding: 'utf8' }).stdout.trim();
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function read(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

// With no input to read (an agent's shell, or `!` in Claude Code) the question never resolves, so
// a closed input counts as "no". Pipe the answer instead: echo y | pnpm ship -m "...".
async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const closed = new Promise((resolve) => rl.once('close', () => resolve('')));
  const answer = await Promise.race([rl.question(question), closed]);
  rl.close();
  if (!answer) console.log('\nNo answer (no input).');
  return answer.trim().toLowerCase() === 'y';
}

function stop(message) {
  console.error(message);
  process.exit(1);
}
