import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  timezoneDetected: boolean;
  defaultCurrency: string;
  reminderHour: number;
};

/**
 * Data access layer entry point. Every user-scoped query starts from the id
 * returned here (EC-SEC-03). Redirects to /login when there is no session.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await getDb().query.users.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
      timezone: true,
      timezoneDetected: true,
      defaultCurrency: true,
      reminderHour: true,
      deletedAt: true,
    },
    where: eq(users.id, userId),
  });
  if (!user || user.deletedAt) redirect("/login");

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    timezoneDetected: user.timezoneDetected,
    defaultCurrency: user.defaultCurrency,
    reminderHour: user.reminderHour,
  };
}
