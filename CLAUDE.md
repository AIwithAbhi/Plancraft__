# Project: plancraft funnel experiments (prototype)

## Stack
- One Next.js 15 app (App Router, TypeScript strict). No Docker, no separate backend.
- Server code lives in app/api/v1/**/route.ts and lib/server/**. Database: Neon + Drizzle.

## Rules
- Read the matching file in specs/ before touching code. The spec wins.
- Run `pnpm check` after every change. Never mark a task done while it fails.
- Visitor-facing copy is German (Sie-form) and English. The header switches language at any time. The choice is the `pc_lang` cookie (`de` or `en`) and defaults to German. Code, comments, and commits stay in English.
- Every file in lib/server starts with `import 'server-only'`.
- Every API route sets `export const runtime = 'nodejs'`.
- AI output must pass the Zod schema in lib/server/schemas. Never trust raw model JSON.
- Prices come from lib/server/catalogs only. The model never sets a price.
- Never log request bodies on /excel routes. Never write uploads anywhere.
- No new dependencies without saying why in the PR description.
- Every user action that matters calls track() with an event from specs/events.md.
- Reference requirement IDs (FR-x.y, NFR-x) in commit messages.

## Commands
- pnpm dev          # app on :3000 against the Neon dev branch
- pnpm check        # eslint, tsc --noEmit, vitest, playwright, code-grader evals
- pnpm evals        # full AI quality suite including model graders
- pnpm db:generate  # drizzle-kit generate
- pnpm db:migrate   # drizzle-kit migrate
