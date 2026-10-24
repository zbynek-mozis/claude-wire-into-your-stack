// PostToolUse hook for Edit|Write: run ESLint with --fix on the edited JS file.
// Problems that can't be auto-fixed go back to Claude on stderr with exit
// code 2, so they get fixed now instead of failing `npm run lint` in CI.

const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  const filePath = JSON.parse(raw).tool_input?.file_path;
  if (!filePath || !/\.(c|m)?js$/.test(filePath)) return;

  const relative = path.relative(projectDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  if (relative.split(path.sep).includes('node_modules')) return;

  let ESLint;
  try {
    ({ ESLint } = require(path.join(projectDir, 'node_modules', 'eslint')));
  } catch {
    // Dependencies not installed yet (no `npm ci`); nothing to lint with.
    return;
  }

  const eslint = new ESLint({ cwd: projectDir, fix: true });
  const results = await eslint.lintFiles([filePath]);
  await ESLint.outputFixes(results);

  const problems = results.reduce((n, r) => n + r.errorCount + r.warningCount, 0);
  if (problems === 0) return;

  const formatter = await eslint.loadFormatter('stylish');
  process.stderr.write(
    `ESLint found problems in ${relative} that --fix could not resolve. Fix them before moving on:\n` +
      (await formatter.format(results)),
  );
  process.exitCode = 2;
}

main().catch((err) => {
  // A broken hook must not block editing; report it without exit code 2.
  console.error(`lint-on-edit hook failed: ${err.message}`);
});
