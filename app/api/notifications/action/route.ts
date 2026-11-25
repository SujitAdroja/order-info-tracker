import { z } from "zod";
import { setPurchaseStatus } from "@/lib/purchases/service";
import { getCurrentUserOrNull } from "@/lib/session";

/**
 * Section 9: "Returned" / "Keeping it" buttons on a return reminder. Called
 * by the service worker with the session cookie (same origin).
 */
const bodySchema = z.object({
  purchaseId: z.uuid(),
  action: z.enum(["returned", "kept"]),
});

export async function POST(request: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "invalid_request" }, { status: 400 });

  const ok = await setPurchaseStatus(
    user,
    parsed.data.purchaseId,
    parsed.data.action,
  );
  return ok
    ? Response.json({ ok: true })
    : Response.json({ error: "not_found" }, { status: 404 });
}
