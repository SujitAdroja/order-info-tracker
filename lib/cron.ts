import "server-only";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * EC-SEC-06: cron endpoints require CRON_SECRET, sent by Vercel Cron as
 * `Authorization: Bearer <secret>` (or `x-cron-secret` for other schedulers).
 */
export function cronAuthorized(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const header = request.headers.get("x-cron-secret");
  const provided = bearer || header;
  return Boolean(provided && safeEqual(provided, secret));
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
