---
description: Check docs/api.md against the implemented routes and report every mismatch (read-only)
argument-hint: "[resource, e.g. users — empty checks everything]"
allowed-tools: mcp__docs__list_allowed_directories, mcp__docs__list_directory, mcp__docs__read_text_file, mcp__docs__search_files, Read, Grep, Glob
---

Check whether the API contract in `docs/api.md` matches what the code actually does. This is a report, not a fix: do not edit any file. Do not run the app, the tests or any shell command — the check must work with only the tools in `allowed-tools`, so it runs the same on every machine and headless.

Scope: $ARGUMENTS
If the scope is empty, check every resource. Otherwise check only the endpoints under that resource (e.g. `users` → `/users...`), plus the global behaviour below.

## Steps

1. Read `docs/api.md` through the `docs` MCP server (`mcp__docs__read_text_file`), not the built-in Read tool. If the server is not connected, say so and stop.
2. Read `server.js` to learn each router's base path and any app-level middleware (body parsing, 404 fallback, error handler).
3. Read the router files in `routes/`, and `db/store.js` where a handler's result depends on the store.
4. For each endpoint, in the docs or the code, compare:
   - whether it exists on both sides (method + full path)
   - request body fields, and which are required
   - every status code it can return, and when
   - the success response shape
   - that every error response is JSON `{ "error": "message" }`
5. Global behaviour: what the client actually receives for an unknown route and for a malformed JSON body. Compare that with the docs' promise about the error shape.

## Output

Start with a single verdict line: `docs-check: N mismatches` (or `docs-check: in sync`).

Then a table, one row per endpoint:

| Endpoint | Docs | Code | Verdict |
|---|---|---|---|

Verdict is one of `ok`, `mismatch`, `undocumented` or `missing in code`.

Then list each mismatch as one bullet with a `file:line` reference and the concrete difference. For each finding, say whether it is read from code or inferred from Express defaults. Keep it short, and do not propose fixes unless asked.
