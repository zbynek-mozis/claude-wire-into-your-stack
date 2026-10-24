# NOTES

How Claude is wired into this repo, and why each choice was made.

## 1. MCP server — `docs` (filesystem, read-only on `docs/`)

**What:** `.mcp.json` registers `@modelcontextprotocol/server-filesystem@2.0.0` as the `docs` server, rooted at `./docs`. `.claude/settings.json` pre-approves only the read-only tools `list_allowed_directories`, `list_directory`, `read_text_file` and `search_files`.

**Why this server:**
- `docs/api.md` is the API contract. Routes and the contract drift apart easily (status codes, error shape, fields), and checking that is a task we repeat. The server gives Claude a channel to the contract that cannot reach anything else: it is jailed to `docs/`.
- No credentials, and no new runtime. Node is already a prerequisite of the repo. The official fetch server would need Python and `uv` on every teammate's machine.
- The version is pinned, so every clone runs the same server. Bumping it is a deliberate, reviewed change.
- Plain `npx` works on Linux, macOS and Windows; we verified it on Windows without a `cmd /c` wrapper. One committed `.mcp.json` therefore serves everyone.

**Why this permission rule:** only the read-only tools we actually use run without a prompt. `list_allowed_directories` is included because Claude calls it first to discover the server's root; without it every docs lookup starts with a prompt. The write tools (`write_file`, `edit_file`, `move_file`, `create_directory`) are not allowed, so they still ask for confirmation. Changes to `docs/` should go through the normal `Edit` flow and the diff review.

**Used on a real task:** a headless docs-vs-routes drift check (`claude -p --mcp-config .mcp.json`). Claude read `docs/api.md` through `mcp__docs__read_text_file` and found two real gaps: non-JSON error responses for malformed JSON and unknown routes, and `PUT /users/:id` accepting `null`.

**First run on a fresh clone:** Claude Code asks once to trust the folder and once to approve the project's `docs` server. That is intentional; a repo should not be able to silently enable its own servers. Until the folder is trusted, Claude Code ignores the `permissions.allow` entries in `.claude/settings.json` (it logs `Ignoring ... permissions.allow entries ... workspace has not been trusted`), so the prompts below only behave as described after the trust dialog.

**Try it:** start `claude` in the repo root, accept the trust dialog, approve the `docs` server, then:

1. Read-only access runs without a prompt:
   ```
   Using the docs MCP server, list the docs folder and tell me which status codes PUT /users/:id is documented to return.
   ```
   Expected: Claude calls `mcp__docs__list_directory` and `mcp__docs__read_text_file` with no permission prompt and answers `200`, `400`, `404`.
2. Writes are not pre-approved:
   ```
   Using the docs MCP server, create docs/scratch.md containing "test".
   ```
   Expected: Claude asks for permission to use `mcp__docs__write_file`. Decline.
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
