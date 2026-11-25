import { runDailyCleanup } from "@/lib/cleanup";
import { cronAuthorized, unauthorized } from "@/lib/cron";

/** Daily: purge raw email content, expire codes, recompute deadlines. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const result = await runDailyCleanup();
  return Response.json({ ok: true, ...result });
}
