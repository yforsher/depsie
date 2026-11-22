// Takes local changes to an open pull request with its CI results: branch, lint and test, commit,
// push, pull request, watch checks. It never merges (that is `pnpm release`). Node, not a shell
// script, so it runs the same on Windows, macOS and Linux.
// Usage: pnpm ship -m "message" [-b branch-name]
import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { message: { type: 'string', short: 'm' }, branch: { type: 'string', short: 'b' } },
});
if (!values.message) stop('Usage: pnpm ship -m "message" [-b branch-name]');

const changes = read('git', ['status', '--short']);
if (!changes) stop('Nothing to commit.');

if (read('git', ['branch', '--show-current']) === 'master') {
  const branch = values.branch ?? slug(values.message);
  run('git', ['switch', '-c', branch]);
}

console.log(`Changes to commit:\n${changes}\n`);
if (!(await confirm('Commit all of these? (y/N) '))) stop('Stopped, nothing committed.');

// pnpm is a .cmd file on Windows, so it needs a shell; these commands take no user input.
for (const script of ['lint', 'test']) {
  if (spawnSync(`pnpm ${script}`, { stdio: 'inherit', shell: true }).status !== 0) {
    stop(`pnpm ${script} failed, nothing committed.`);
  }
}

run('git', ['add', '--all']);
run('git', ['commit', '-m', values.message]);
run('git', ['push', '--set-upstream', 'origin', 'HEAD']);

// A push already updates an open pull request, so open one only when the branch has none.
if (spawnSync('gh', ['pr', 'view'], { stdio: 'ignore' }).status !== 0) {
  run('gh', ['pr', 'create', '--fill']);
}

const passed = spawnSync('gh', ['pr', 'checks', '--watch'], { stdio: 'inherit' }).status === 0;
const url = read('gh', ['pr', 'view', '--json', 'url', '--jq', '.url']);
console.log(`\n${url}\n${passed ? 'All checks passed.' : 'Some checks failed.'}`);
process.exitCode = passed ? 0 : 1;

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

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

function stop(message) {
  console.error(message);
  process.exit(1);
}
