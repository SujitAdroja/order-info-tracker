// Local stand-in for Vercel Cron (vercel.json). Run next to `npm run dev`:
//   npm run cron:dev
// Calls the same endpoints with CRON_SECRET from .env. Dev only.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^"|"$/g, "")]),
);
const base = process.env.APP_URL ?? env.AUTH_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET ?? env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is missing in .env");
  process.exit(1);
}

const jobs = [
  { path: "/api/cron/retry", everyMin: 5 },
  { path: "/api/cron/reminders", everyMin: 15 },
  { path: "/api/cron/cleanup", everyMin: 24 * 60 },
];

async function run(path) {
  try {
    const res = await fetch(new URL(path, base), {
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log(
      `${new Date().toLocaleTimeString()} ${path} ${res.status} ${body.slice(0, 200)}`,
    );
  } catch (e) {
    console.log(
      `${new Date().toLocaleTimeString()} ${path} failed: ${e.message} (is the dev server running?)`,
    );
  }
}

console.log(`dev cron → ${base} (Ctrl+C to stop)`);
for (const job of jobs) {
  await run(job.path);
  setInterval(() => run(job.path), job.everyMin * 60_000);
}
