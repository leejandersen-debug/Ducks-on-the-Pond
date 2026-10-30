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

## Updates

**2026-10-23: Single Next.js app.** We tried Express + Vite and reverted it. The project is one Next.js 16 app (App Router) at the repo root. API routes go in `app/api/<resource>/route.ts`, and the pg pool is in `lib/db.ts`. Local dev uses `.env.development.local`, which points at the Neon dev branch.

**2026-10-23: Neon Auth kept in reserve.** Neon Auth (Better Auth) is enabled on both Neon branches but unused, and its Vercel env vars were removed. It stays available as a possible login provider. If another provider is chosen, disable it on both branches with `neonctl neon-auth disable`.

**2026-10-24: Migrations and RLS in practice.** Migrations use node-pg-migrate with plain SQL files in `migrations/` (`npm run migrate:dev`, dev branch only, guarded by `NEON_BRANCH=dev`). Requests run as role `app_rw` through `withUser()` in `lib/db.ts`, so RLS applies, and `app.user_id` is set per transaction. `schema-sketch.sql` is superseded by the migrations. Login is a temporary cookie switcher enabled only by `TEST_LOGIN=1` locally. Real auth is still undecided.

**2026-10-25: Chroma for the lesson only.** `chromadb` was installed for the RAG-corpus lesson as an exception to Postgres-only. The app stays on Postgres for everything, including vector search through pgvector on Neon. App features don't get built on Chroma. Removing the Chroma leftovers (`lib/chroma.ts`, the local store and the packages) is still an open call.

**2026-10-26: Production migrations need approval.** The hold on production schema deploys was lifted, but each production migration still needs approval before it runs.
