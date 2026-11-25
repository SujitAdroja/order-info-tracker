import { listPurchaseSummaries } from "@/lib/purchases/service";
import { getCurrentUserOrNull } from "@/lib/session";

/**
 * Section 11 `GET /api/purchases`: dashboard data as JSON. The service worker
 * keeps the last copy so the offline page can show it (EC-PWA-01).
 */
export async function GET() {
  const user = await getCurrentUserOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const purchases = await listPurchaseSummaries(user);
  return Response.json(
    {
      userId: user.id,
      timezone: user.timezone,
      savedAt: new Date().toISOString(),
      purchases,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
