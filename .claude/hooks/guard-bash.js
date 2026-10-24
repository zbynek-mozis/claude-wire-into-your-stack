// PreToolUse hook for Bash|PowerShell: block commands that destroy work or
// publish something and can't be taken back. Exit code 2 blocks the call and
// sends the reason to Claude.

const RULES = [
  {
    pattern: /\bgit\s+push\b.*\s(--force(?!-with-lease)|-f)(\s|$)/,
    reason: 'force-pushing rewrites shared history',
  },
  {
    pattern: /\bgit\s+reset\b.*\s--hard\b/,
    reason: 'git reset --hard discards uncommitted work',
  },
  {
    pattern: /\bgit\s+clean\b.*\s-[a-zA-Z]*f/,
    reason: 'git clean -f deletes untracked files',
  },
  {
    // A recursive flag and a force flag anywhere in the same rm call:
    // -rf, -fr, -r -f, --recursive --force, ...
    pattern:
      /\brm(?=[^;&|]*\s(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(\s|$))(?=[^;&|]*\s(-[a-zA-Z]*f[a-zA-Z]*|--force)(\s|$))/,
    reason: 'rm -rf deletes files without recovery',
  },
  {
    pattern: /\bnpm\s+publish\b/,
    reason: 'npm publish releases the package publicly',
  },
];

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  const command = JSON.parse(raw).tool_input?.command;
  if (!command) return;

  const hit = RULES.find((rule) => rule.pattern.test(command));
  if (!hit) return;

  process.stderr.write(
    `Blocked by project hook (.claude/hooks/guard-bash.js): ${hit.reason}.\n` +
      'Do not retry or work around this. Explain to the user what you wanted to run and why, ' +
      'and let them run it themselves if it is really needed.\n',
  );
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(`guard-bash hook failed: ${err.message}`);
});
