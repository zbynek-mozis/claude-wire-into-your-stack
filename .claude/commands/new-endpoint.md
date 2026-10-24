---
description: Scaffold a new endpoint end to end — store, route, mount, tests, docs — then lint and test
argument-hint: "<METHOD> <path> [what it does], e.g. DELETE /users/:id remove a user"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm test), Bash(npm run lint)
---

Scaffold a new endpoint in this API.

Input: `$ARGUMENTS`

Read it as `<METHOD> <path> [what it does]`: the first word is the HTTP method, the second the path, and everything after that describes the behaviour.

## Before writing anything

Stop with a one-line usage hint (`/new-endpoint <METHOD> <path> [what it does]`) if:
- the method is not one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- the path does not start with `/`

Check `server.js` and `routes/` for an existing handler with the same method and path. If one exists, stop and point to it. This command adds endpoints, it does not rewrite them.

If no behaviour is given and it can't be inferred from the method and path (`GET /users/:id` can, `POST /users/:id/archive` can't), ask one short question before writing.

## Build it

Follow the project's `adding-api-endpoint` skill step by step: store → route → mount → tests → docs. Match the existing code exactly: comment style above handlers, `Number(req.params.id)`, `{ error }` bodies, 400/404/201/204, and one test per response path.

Change only what this endpoint needs. Do not refactor or "fix" neighbouring handlers. If you notice a problem there, mention it at the end.

## Finish

Run `npm run lint` and `npm test`. If either fails, fix it and run both again.

Then report:
- one line per file changed, with what was added
- the final `npm run lint` / `npm test` result
- anything you noticed but deliberately did not change
