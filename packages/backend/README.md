# @repo/backend

Hyperlocal quick-commerce API. Hono + Kysely + Postgres, built as a modular monolith.

## Quick start

```bash
cp packages/backend/.env.example packages/backend/.env   # then edit the secrets
bun install
bun run infra:up          # postgres + redis (from the repo root)
bun run db:migrate        # apply migrations
bun run db:codegen        # regenerate src/platform/db/types.ts from the live schema
bun --filter @repo/backend dev
```

- API: `http://localhost:3001`
- Docs: `http://localhost:3001/docs` (Scalar, generated from the Zod schemas)
- OpenAPI: `http://localhost:3001/openapi.json`
- Readiness: `http://localhost:3001/health` · Liveness: `/health/live`

## Layout

```
migrations/            hand-written SQL, run by kysely-ctl, forward-only
src/
  platform/            cross-cutting infrastructure, no business rules
    config/env.ts      the only place process.env is read; validated at boot
    db/                pg Pool (singleton) + Kysely + generated types
    errors/            AppError hierarchy; code + status + isOperational
    http/              context, request-id, error handler, auth middleware
    security/          JWT signing and refresh-token hashing
    logger/            pino, structured, with redaction
  modules/             one folder per domain area
    <name>/
      <name>.controller.ts   HTTP only: contract in, service call, response out
      <name>.service.ts      business rules; knows nothing about HTTP
      <name>.repository.ts   Kysely queries; knows nothing about rules
      <name>.schema.ts       Zod -> validation + types + OpenAPI, from one source
      index.ts               the module's public surface
  app.ts               composition root: middleware, routes, docs
  index.ts             server bootstrap + graceful shutdown
```

**The boundary rule:** a module may import another module's `index.ts`, never
its internals. An ESLint `no-restricted-imports` rule enforces it. That single
constraint is what would make extracting a module into its own service a
mechanical job instead of a rewrite.

## Conventions worth knowing

- **Money is an integer count of paise.** Never a float, anywhere.
- **Relative imports carry a `.js` extension** even from `.ts` files. That is
  real Node ESM resolution (`module: NodeNext`), not a TypeScript quirk — you
  are importing the emitted file.
- **The database is the source of truth for types.** Write a migration, run it,
  then `bun run db:codegen`. Never hand-edit `src/platform/db/types.ts`.
- **`available` is never stored.** It is `quantity - reserved`, derived per query.
- **Snake_case in the database, camelCase in JSON.** The translation happens in
  controllers, at the edge, in one direction each way.

## What is deliberately unimplemented

The scaffold compiles and runs; the business logic is the exercise. Every stub
throws `Not implemented` and carries the reasoning, the failure modes, and the
decisions to make in its doc comment:

| Module | What is left to write |
|---|---|
| `auth` | register, login, refresh rotation with replay detection, logout |
| `catalog` | cursor-paginated listing, full-text search against the GIN index |
| `inventory` | reservation, release, commit, expiry sweeper — the centrepiece |
| `cart` | totals, coupons, store-switching behaviour |
| `orders` | checkout, cancellation, the transition funnel |
| `payments` | the mock gateway, including its timeout outcome |

Implemented as references to copy: `modules/health` (route wiring),
`modules/stores` (a full controller → service → repository slice), and
`modules/orders/order-state-machine.ts` (plus its test).

## Tests

```bash
bun --filter @repo/backend test
```

`order-state-machine.test.ts` runs with no database and passes today. The two
tests that will matter most do not exist yet:

1. **Concurrent reservation** — N simultaneous reservations against stock of 1;
   exactly one succeeds. Proves no overselling.
2. **Duplicate checkout** — the same `Idempotency-Key` five times; exactly one
   order exists.

Both need a real Postgres, which is what `@testcontainers/postgresql` is for.
