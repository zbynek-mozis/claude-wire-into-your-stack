---
name: adding-api-endpoint
description: Use when adding, changing or removing an HTTP endpoint or resource in this Express API — e.g. "add DELETE /users/:id", "add a /products resource", "make POST /users also accept a role", "change what GET /users/:id returns". Covers the full slice — db/store.js, routes/, server.js, tests/ and docs/api.md. Not for test-only, docs-only, lint or tooling changes.
---

# Adding or changing an API endpoint

An endpoint here is not done until five places agree: store, route, mount, tests, docs. Work through them in this order.

## 1. Store — `db/store.js`

- All data access goes through the store. Routes never keep state.
- Add a small named function per operation (`deleteUser(id)`, `listProducts()`). Return the record, or `undefined` when it does not exist — routes turn `undefined` into a 404.
- New resource: add its array and `nextId` counter, seed them in `seed()` so `reset()` restores them, and add the new functions to `module.exports`.

## 2. Route — `routes/<resource>.js`

- One file per resource, exporting an `express.Router()`.
- Put a one-line comment above each handler in the existing style: `// DELETE /users/:id — remove a user, or 404 if it doesn't exist.`
- Parse ids with `Number(req.params.id)`.
- Validate input in the route, before calling the store:
  - bad or missing input → `400` with `{ error: '<what is wrong>' }`
  - record not found → `404` with `{ error: '<Resource> not found' }`
  - created → `201` with the new record; deleted → `204` with no body
- Error bodies are always JSON `{ "error": "message" }`. Never send a plain string or HTML.
- Use `return res...` in every branch so a handler never responds twice.
- Match the validation of sibling handlers. If you spot an inconsistency (one handler rejects `null`, another accepts it), point it out instead of copying it.

## 3. Mount — `server.js`

New resource only: `require` the router and mount it with `app.use('/<resource>', <resource>Router)` next to the existing ones.

## 4. Tests — `tests/<resource>.test.js`

- Node's built-in runner and supertest, the same as in `tests/users.test.js`:
  ```js
  const test = require('node:test');
  const assert = require('node:assert');
  const request = require('supertest');
  const app = require('../server');
  const store = require('../db/store');

  test.beforeEach(() => store.reset());
  ```
- One `test()` per response path: the success case, and each `400` and `404`.
- Name tests `'<METHOD> <path> <expected outcome>'`, e.g. `'DELETE /users/:id returns 404 for a missing user'`.
- Assert the status code, and for errors also that `res.body.error` is set.

## 5. Docs — `docs/api.md`

Add or update the endpoint's `###` section under its resource. Use the existing wording: what it does, the body it accepts, and every status code it can return.

## 6. Verify

Run `npm run lint` and `npm test`. Both must pass before you report the endpoint as done. Show the output if anything fails.
