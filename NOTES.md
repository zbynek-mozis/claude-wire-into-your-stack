# NOTES

How Claude is wired into this repo, and why each choice was made.

## 1. MCP server — `docs` (filesystem, read-only on `docs/`)

**What:** `.mcp.json` registers `@modelcontextprotocol/server-filesystem@2.0.0` as the `docs` server, rooted at `./docs`. `.claude/settings.json` pre-approves only the read-only tools `list_allowed_directories`, `list_directory`, `read_text_file` and `search_files`, and denies the server's write tools.

**Why this server:**
- `docs/api.md` is the API contract. Routes and the contract drift apart easily (status codes, error shape, fields), and checking that is a task we repeat. The server gives Claude a channel to the contract that cannot reach anything else: it is jailed to `docs/`.
- No credentials, and no new runtime. Node is already a prerequisite of the repo. The official fetch server would need Python and `uv` on every teammate's machine.
- The version is pinned, so every clone runs the same server. Bumping it is a deliberate, reviewed change.
- Plain `npx` works on Linux, macOS and Windows; we verified it on Windows without a `cmd /c` wrapper. One committed `.mcp.json` therefore serves everyone.

**Why this permission rule:** only the read-only tools we actually use run without a prompt. `list_allowed_directories` is included because Claude calls it first to discover the server's root; without it every docs lookup starts with a prompt. The write tools (`write_file`, `edit_file`, `move_file`, `create_directory`) are in `permissions.deny`, so the server can never change `docs/`, not even after a confirmation prompt. The `docs` server is a read channel to the contract. Changes to `docs/` go through the normal `Edit` flow, where the lint hook and the diff review see them.

**Used on a real task:** a headless docs-vs-routes drift check (`claude -p --mcp-config .mcp.json`). Claude read `docs/api.md` through `mcp__docs__read_text_file` and found two real gaps: non-JSON error responses for malformed JSON and unknown routes, and `PUT /users/:id` accepting `null`.

**First run on a fresh clone:** Claude Code asks once to trust the folder and once to approve the project's `docs` server. That is intentional; a repo should not be able to silently enable its own servers. Until the folder is trusted, Claude Code ignores the `permissions.allow` entries in `.claude/settings.json` (it logs `Ignoring ... permissions.allow entries ... workspace has not been trusted`), so the prompts below only behave as described after the trust dialog.

**Try it:** start `claude` in the repo root, accept the trust dialog, approve the `docs` server, then:

1. Read-only access runs without a prompt:
   ```
   Using the docs MCP server, list the docs folder and tell me which status codes PUT /users/:id is documented to return.
   ```
   Expected: Claude calls `mcp__docs__list_directory` and `mcp__docs__read_text_file` with no permission prompt and answers `200`, `400`, `404`.
2. Writes through the server are denied:
   ```
   Using the docs MCP server, create docs/scratch.md containing "test".
   ```
   Expected: the `mcp__docs__write_file` call is denied without a prompt, and `docs/scratch.md` is not created.
3. The server is jailed to `docs/`:
   ```
   Using the docs MCP server, read server.js.
   ```
   Expected: the server refuses with `Access denied - path outside allowed directories` (verified).

## 2. Skill — `adding-api-endpoint`

**What:** `.claude/skills/adding-api-endpoint/SKILL.md` is the procedure for adding or changing an endpoint. It walks through store → route → mount → tests → docs → lint and test, in that order.

**Why this way of working:** changing an endpoint is the most common change in this repo, and it is only correct when five places agree. `CLAUDE.md` lists the rules: store-only access, 400/404, `{ error }`. It does not list the steps that get forgotten:
- seeding a new resource so `store.reset()` restores it
- one test per response path
- updating `docs/api.md`
- finishing with lint and tests

The skill also tells Claude to flag inconsistent validation between handlers, such as `PUT` accepting `null` where `POST` rejects it, instead of copying it.

**How the description is worded to fire:**
- It starts with the trigger, "adding, changing or removing an HTTP endpoint or resource".
- It gives four concrete example requests: add, new resource, extend a body, change a response. These make it fire on behaviour changes that never say "endpoint".
- It names the files it touches, so Claude can tell it apart from other work.
- It ends with explicit exclusions: test-only, docs-only, lint, tooling. Those are the nearby requests that should not pull in the whole procedure.

**Trigger check (headless, plan mode, the prompts never name the skill):**

| Prompt | Fired? | Correct |
|---|---|---|
| Add a DELETE /users/:id endpoint. | yes | ✓ |
| Add a /products resource with list and get-by-id. | yes | ✓ |
| POST /users should reject an email that is already taken. | yes | ✓ |
| Přidej možnost smazat uživatele přes API. | yes | ✓ |
| Add a test for GET /health. | no | ✓ |
| Fix any ESLint warnings in the repo. | no | ✓ |
| Explain how the users route validates input. | no | ✓ |

**Try it:** in a fresh `claude` session in the repo root:

1. Fires on an endpoint change:
   ```
   Add a DELETE /users/:id endpoint.
   ```
   Expected:
   - Claude loads `adding-api-endpoint` before planning.
   - It adds `deleteUser` to `db/store.js` and the handler to `routes/users.js` (204, or 404 with `{ error }`).
   - It writes tests for both paths and a `DELETE /users/:id` section in `docs/api.md`.
   - It ends with passing `npm run lint` and `npm test`.
2. Stays quiet on a nearby request:
   ```
   Add a test for GET /health.
   ```
   Expected: only a test is written, and the skill is not loaded.

To check without changing files, run the prompt with `claude -p "<prompt>" --permission-mode plan --output-format stream-json --verbose` and look for a `Skill` tool call with `"skill":"adding-api-endpoint"`.

## 3. Command — `/docs-check [resource]`

**What:** `.claude/commands/docs-check.md` compares `docs/api.md` with the implemented routes and reports every mismatch. It never fixes anything. The output starts with a one-line verdict (`docs-check: N mismatches`), then a per-endpoint table, then one bullet per mismatch with a `file:line` reference. `$ARGUMENTS` narrows the check to one resource; empty checks everything.

**Why it is worth a shortcut:**
- We run this check before every PR that touches routes. Typed by hand, the prompt is long, and the result depends on how carefully you word it.
- Saved, it always checks the same things: method and path, required fields, every status code, success shape, JSON error shape. It also checks global behaviour, meaning unknown routes and malformed JSON, which a hand-written prompt usually forgets.
- On its first run it found two real gaps.
- It is the read-only counterpart of the `adding-api-endpoint` skill. The skill keeps docs in sync while you build; the command catches drift afterwards.

**Design choices:**
- It reads the contract through the `docs` MCP server, so the command exercises the task 1 wiring and fails loudly if the server is not connected.
- `allowed-tools` pre-approves only read-only tools: the four `mcp__docs__*` tools, plus `Read`, `Grep` and `Glob`. `allowed-tools` only adds approvals and restricts nothing. On a machine with a broad user-level `Bash` allow, the first version started the app to probe it. The prompt therefore forbids running the app, the tests or shell commands. After that change a run used only `mcp__docs__read_text_file` and `Read`. That keeps the command identical on every machine and safe for the headless run in task 5.
- Each finding says whether it is read from code or inferred from Express defaults, so the reader knows what was verified and what was not.

**Try it:** in a `claude` session in the repo root, with the `docs` server approved:

1. ```
   /docs-check users
   ```
   Expected: `docs-check: 2 mismatches`. The four `/users` endpoints are `ok`. Two global mismatches:
   - an unknown route returns Express's HTML 404
   - a malformed JSON body returns Express's HTML 400

   Both contradict the `{ "error": "message" }` promise in `docs/api.md`. No files change and no shell command runs.
2. ```
   /docs-check
   ```
   Expected: the same, plus the `GET /health` row as `ok`.

## 4. Hooks — lint after every edit, guard before every shell command

Both hooks are committed in `.claude/settings.json`. Their logic lives in Node scripts under `.claude/hooks/`, which run on Linux, macOS and Windows without `jq` or `bash`-only tools. Node is already required by the repo. Each hook is called as `node "$CLAUDE_PROJECT_DIR/.claude/hooks/<script>.js"`, so it works from any working directory.

### 4a. `lint-on-edit.js` — reacts (`PostToolUse`, matcher `Edit|Write`)

**What:**
- After Claude edits or writes a `.js`/`.cjs`/`.mjs` file inside the repo, the hook runs ESLint on that one file with `--fix`. It uses the repo's own `node_modules/eslint` and `eslint.config.js`.
- If problems remain that `--fix` cannot resolve, it prints them in ESLint's `stylish` format on stderr and exits with code 2. Claude receives that output and fixes the problems in the same turn.
- It skips non-JS files, files outside the repo and `node_modules/`. It also skips everything when dependencies are not installed.

**Why:**
- `npm run lint` is a CI gate, so today a lint error surfaces minutes later in the pipeline.
- The hook moves that check to the moment of the edit, on the one file that changed. That keeps it fast and its feedback specific.
- It reacts instead of preventing: there is nothing to block before an edit, and the value is in the feedback after it.
- Warnings are reported too. `no-unused-vars` is a warning here, and leftovers like that are cheapest to fix while Claude still has the context.
- A crash inside the hook itself never returns exit code 2, so a broken hook cannot block editing.

### 4b. `guard-bash.js` — prevents (`PreToolUse`, matcher `Bash|PowerShell`)

**What:** before any shell command runs, the hook blocks it with exit code 2 if it matches one of these rules:

| Blocked | Reason |
|---|---|
| `git push --force` / `-f` (`--force-with-lease` is allowed) | force-pushing rewrites shared history |
| `git reset --hard` | git reset --hard discards uncommitted work |
| `git clean -f…` | git clean -f deletes untracked files |
| `rm` with a recursive and a force flag in any form (`-rf`, `-fr`, `-r -f`, `-R -f`, `--recursive --force`) | rm -rf deletes files without recovery |
| `npm publish` | npm publish releases the package publicly |

Claude gets the reason and is told not to work around the block, and to let the user run the command themselves.

**Why:**
- These are the commands that destroy work or publish something, and they cannot be undone.
- A permission rule is not enough. Many developers allow `Bash` broadly in their user settings, and a user-level allow silently overrides any prompt the project would want. A hook runs whatever the permissions say.
- The guard covers `PowerShell` as well, because on Windows Claude Code may use it instead of Bash.

**Known trade-offs:**
- It matches text, not intent. Any command line that only contains a pattern is blocked too, such as `echo "rm -rf"`, a prompt string passed to `claude -p`, or a heredoc that writes these very notes. That happened twice while we built this. We accept those false positives: a blocked harmless command costs a sentence, a missed destructive one costs work. Text goes into files through `Edit`/`Write`, which the guard does not watch.
- It does not try to catch deliberate obfuscation, such as variables or `eval`. It is a seatbelt, not a sandbox.

### Verification

- **Scripts in isolation**, with simulated hook input on stdin:
  - 17 guard cases: every blocked form exits with 2. `git push -u`, `--force-with-lease`, `reset --soft`, `clean -n`, plain `rm`, `rm -r`, `rm -f`, `git rm -r --cached` and `rm -r a; rm -f b` exit with 0.
  - The lint hook reports an unfixable `no-undef` error with exit 2, auto-fixes `if (!!x)` to `if (x)` with exit 0, and ignores `README.md` and files outside the repo.
- **End to end:**
  - The guard blocked real `Bash` calls in a live Claude Code session: `PreToolUse:Bash hook error: … Blocked by project hook … rm -rf deletes files without recovery`.
  - In a headless run, `Write` of a file with `undefinedThing();` came back as `PostToolUse:Write hook blocking error … ESLint found problems … no-undef`.

**Try it:** in a `claude` session in the repo root, with the folder trusted:

1. Lint hook reacts after an edit:
   ```
   Create routes/scratch.js with the single line `undefinedThing();`, then tell me what feedback you got.
   ```
   Expected: Claude reports ESLint's `'undefinedThing' is not defined  no-undef` from the `PostToolUse:Write` hook. Delete `routes/scratch.js` afterwards.
2. Guard prevents a destructive command:
   ```
   Discard all my local changes with git reset --hard.
   ```
   Expected: the `Bash` call is blocked with `Blocked by project hook (.claude/hooks/guard-bash.js): git reset --hard discards uncommitted work`. Claude explains instead of retrying, and nothing is reset.
