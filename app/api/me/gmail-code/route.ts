import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** F2: the pending Gmail forwarding confirmation code, polled by onboarding. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const user = await getDb().query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      pendingGmailCode: true,
      pendingGmailCodeExpiresAt: true,
      gmailForwardingVerified: true,
    },
  });
  const live =
    user?.pendingGmailCode &&
    user.pendingGmailCodeExpiresAt &&
    user.pendingGmailCodeExpiresAt > new Date();

  return Response.json(
    {
      code: live ? user!.pendingGmailCode : null,
      verified: user?.gmailForwardingVerified ?? false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
