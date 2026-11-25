import { cronAuthorized, unauthorized } from "@/lib/cron";
import { processInboundEmail, retryCandidates } from "@/lib/ingest/process";

/** Every 5 min: process pending/failed inbound emails (EC-ING-17, EC-ING-23). */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const ids = await retryCandidates();
  for (const id of ids) await processInboundEmail(id);
  return Response.json({ ok: true, processed: ids.length });
}
