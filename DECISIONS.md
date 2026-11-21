# Decisions

The binding guidance for the trading-card collection and trade app. The original document was given on 2026-10-23; later updates are listed below it.

## What we're building

A multi-user trading-card app with three parts:

- a shared card catalog
- each user's collection of owned copies
- trades that move copies between two users

A React Native mobile app is planned later.

## Stack decisions (2026-10-23)

**Data shape: relational.** Catalog, collections and trades are separate entities joined by links. Parallels, autographs and serial-numbered cards are modeled up front. Getting the catalog/collection split wrong is costly once real users have data.

**Database: Postgres.** Row-level security keeps collections private. JSONB holds unusual card attributes. Every schema change is a migration that we maintain.

**Language: TypeScript (Node).** The Card and Trade types are shared across web, API and mobile. Card-image recognition goes to an outside service and doesn't run in Node.

**Framework: Next.js.** Web pages and the mobile API ship as one project with one deploy. The tradeoff is that the API follows Next.js routing and caching rules.

**Frontend: React via Next.js.** Chosen as the path to React Native.

**Hosting: Vercel.** Short requests plus a nightly price-update cron. Needs a connection pooler. A continuous scraper would run on another host, such as Render.

## Priority order and what lost

The six choices above are ranked by **how expensive each would be to reverse once real users have data**, hardest first. Each choice was made only after the ones above it, and it inherits their constraints. The alternatives and reasons are from the original document (2026-10-23), unless marked as found during the build.

1. **Data shape: relational.** Lost: **a document model.** It would copy each card's player and set details into every user's collection, so fixing a catalog mistake or answering "who owns this card?" gets messy. Ranked first because reshaping tables under real collections is the most expensive reversal in the project.
2. **Database: Postgres.** Lost: **SQLite**, which struggles with many people writing at once, and that's exactly what a multi-user app does. Postgres also brings row-level security for private collections and JSONB for odd card attributes.
   - *Found during the build (2026-10-25):* **Chroma** was installed for vector search in the RAG lesson. **pgvector inside the same Postgres** won for the app: one database, the same backups, the same row-level security. Chroma stayed lesson-only.
3. **Language: TypeScript (Node).** Lost: **Python on the backend.** It would split the project into two languages, and the phone and the server couldn't share one Card or Trade definition. Accepted cost: Node is poor at heavy computation, so image recognition goes to an outside service.
4. **Backend framework: Next.js.** Lost: **Express**, which would mean a separate second project to build, deploy and keep in step.
   - *Found during the build (2026-10-23):* the first scaffold was **Express plus a Vite React app** (commit `cb2e4e4`). It contradicted this decision, and it was replaced the same day while that was still cheap (commit `7b38b27`). Accepted cost: the mobile API follows Next.js's routing and caching rules, and leaving Next.js later means rewriting the API layer.
5. **Frontend: React via Next.js.** Lost: **Vue and Svelte.** Neither gives a path to the phone, while React carries over to React Native. Ranked below the framework because the frontend can't change direction without the framework changing with it.
6. **Hosting: Vercel.** Lost: **an always-on server on Render** for the app itself, since short requests and a nightly job fit Vercel better. Ranked last because it's the easiest to change. Render stays the answer for anything long-running, such as a continuous price scraper.
   - *Found during the build (2026-11-20):* the MCP door went to **the same host**, as its own small Vercel project (`catalog-door`). No reason came up to split hosts.

Still open: **login provider.** Neon Auth is enabled but unused (2026-10-23 update). Clerk or another provider may replace it.

## Updates

**2026-10-23: Single Next.js app.** We tried Express + Vite and reverted it. The project is one Next.js 16 app (App Router) at the repo root. API routes go in `app/api/<resource>/route.ts`, and the pg pool is in `lib/db.ts`. Local dev uses `.env.development.local`, which points at the Neon dev branch.

**2026-10-23: Neon Auth kept in reserve.** Neon Auth (Better Auth) is enabled on both Neon branches but unused, and its Vercel env vars were removed. It stays available as a possible login provider. If another provider is chosen, disable it on both branches with `neonctl neon-auth disable`.

**2026-10-24: Migrations and RLS in practice.** Migrations use node-pg-migrate with plain SQL files in `migrations/` (`npm run migrate:dev`, dev branch only, guarded by `NEON_BRANCH=dev`). Requests run as role `app_rw` through `withUser()` in `lib/db.ts`, so RLS applies, and `app.user_id` is set per transaction. `schema-sketch.sql` is superseded by the migrations. Login is a temporary cookie switcher enabled only by `TEST_LOGIN=1` locally. Real auth is still undecided.

**2026-10-25: Chroma for the lesson only.** `chromadb` was installed for the RAG-corpus lesson as an exception to Postgres-only. The app stays on Postgres for everything, including vector search through pgvector on Neon. App features don't get built on Chroma. Removing the Chroma leftovers (`lib/chroma.ts`, the local store and the packages) is still an open call.

**2026-10-26: Production migrations need approval.** The hold on production schema deploys was lifted, but each production migration still needs approval before it runs.

**2026-11-20: The live catalog door is scoped to the caller's own collection.** When `catalog-mcp` is deployed, its credential maps to one account, and its search reads only that account's own copies (`owner_id = app_user()`, as `inventory_report` does). Callers have no parameter that can name another account. The scope is filtered explicitly rather than left to RLS alone, because RLS also lets anyone read other users' tradeable copies and lets admins read everything.

**2026-11-21: The catalog cleanup chore stays on production.** `Rules.md` keeps the Neon production branch as the chore's standing target, guarded by `scripts/assert-prod-branch.mjs` and run through `npm run cleanup:prod`. The dev branch is no longer a cleanup target, so changing that takes a deliberate edit to `Rules.md`. The rungs in `autonomy-justification.md` are unchanged.
