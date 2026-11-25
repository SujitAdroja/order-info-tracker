# KeepTrack

A warranty and returns tracker (PWA). Users forward the order emails they choose, and KeepTrack works out return deadlines and warranty end dates and sends reminders. It never accesses anyone's inbox.

- Build spec: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- Status: [PROGRESS.md](PROGRESS.md)

## Local setup

Requires Node 22+ and Docker.

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET: openssl rand -base64 33
npm run db:up                 # Postgres 16 on localhost:5434
npm run db:migrate
npm run db:seed               # top-10 stores
npm run dev                   # http://localhost:3000
```

Without `RESEND_API_KEY`, sign-in links are printed to the dev server console, not emailed.

## Scripts

| Script                                  | What it does                                                 |
| --------------------------------------- | ------------------------------------------------------------ |
| `npm run dev` / `build` / `start`       | Next.js                                                      |
| `npm run lint` / `typecheck` / `format` | ESLint, `tsc`, Prettier                                      |
| `npm test`                              | Vitest unit tests (`tests/unit`)                             |
| `npm run test:e2e`                      | Playwright (`tests/e2e`; starts its own dev server on :3100) |
| `npm run db:generate` / `db:migrate`    | Drizzle migrations from `lib/db/schema.ts`                   |
| `npm run db:seed`                       | Upsert the top-10 stores (`lib/db/seed/stores.ts`)           |
| `npm run db:studio`                     | Drizzle Studio                                               |

First time running e2e: `npx playwright install chromium`.
