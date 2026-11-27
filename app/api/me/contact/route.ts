import { CONTACT_FILENAME, forwardingVCard } from "@/lib/forwarding";
import { getCurrentUserOrNull } from "@/lib/session";
import { ensureForwardingAddress } from "@/lib/users";

/** "Add to contacts": the forwarding address as a .vcf contact card. */
export async function GET() {
  const user = await getCurrentUserOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const address = await ensureForwardingAddress(user.id);
  return new Response(forwardingVCard(address), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${CONTACT_FILENAME}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
