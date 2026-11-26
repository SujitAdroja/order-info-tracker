import { exportUserData } from "@/lib/account";
import { audit } from "@/lib/audit";
import { todayInTimeZone } from "@/lib/dates";
import { consume, LIMITS, minutesText, rateKey } from "@/lib/rate-limit";
import { getCurrentUserOrNull } from "@/lib/session";

/** EC-ACC-05: download everything as a zip (JSON + CSV). */
export async function GET() {
  const user = await getCurrentUserOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const limit = await consume(rateKey("export", user.id), LIMITS.export);
  if (!limit.ok) {
    return new Response(
      `Too many exports today. Try again in ${minutesText(limit.retryAfterSeconds)}.`,
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const zip = await exportUserData(user.id);
  await audit(user.id, "account.export", { bytes: zip.byteLength });
  const name = `keeptrack-export-${todayInTimeZone(user.timezone)}.zip`;
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
