import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { inboundEmails } from "@/lib/db/schema";

const TYPE_LABEL: Record<string, string> = {
  order_confirmation: "Order confirmation",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refund: "Refund",
  return_initiated: "Return started",
  invoice: "Invoice",
  other: "Other",
};

/**
 * Section 11 screen 4 / privacy promise: exactly what we kept from each
 * email. Raw content is deleted after processing, so this is all there is.
 */
export async function EmailProvenance({
  userId,
  purchaseId,
}: {
  userId: string;
  purchaseId: string;
}) {
  const emails = await getDb()
    .select({
      id: inboundEmails.id,
      fromDomain: inboundEmails.fromDomain,
      emailType: inboundEmails.emailType,
      receivedAt: inboundEmails.receivedAt,
      llmParsedAt: inboundEmails.llmParsedAt,
      rawEncrypted: inboundEmails.rawEncrypted,
    })
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.userId, userId),
        eq(inboundEmails.purchaseId, purchaseId),
      ),
    )
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(20);
  if (!emails.length) return null;

  return (
    <section aria-labelledby="stored" className="grid gap-3">
      <h2 id="stored" className="font-medium">
        What we stored from your emails
      </h2>
      <p className="text-sm text-muted-foreground">
        We read the order details above, then deleted the email itself. For each
        email we keep only:
      </p>
      <ul className="grid gap-2" data-testid="email-provenance">
        {emails.map((e) => (
          <li key={e.id} className="rounded-lg border px-3 py-2 text-sm">
            <span className="font-medium">
              {TYPE_LABEL[e.emailType ?? "other"] ?? "Email"}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · from {e.fromDomain ?? "unknown sender"} · received{" "}
              {e.receivedAt.toISOString().slice(0, 10)}
              {e.llmParsedAt
                ? " · read with AI (personal details removed first)"
                : ""}
              {e.rawEncrypted
                ? " · original still being processed"
                : " · original deleted"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
