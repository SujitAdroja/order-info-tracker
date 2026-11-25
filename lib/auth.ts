import "server-only";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { getDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { env, googleAuthEnabled } from "@/lib/env";
import { ensureForwardingAddress } from "@/lib/users";

/**
 * Dev/test-only magic link delivery when no email provider key is set.
 * Production refuses to start without RESEND_API_KEY (see lib/env.ts).
 */
async function deliverMagicLinkLocally(email: string, url: string) {
  const dir = env().E2E_MAGIC_LINK_DIR;
  if (dir) {
    const name = createHash("sha256").update(email.toLowerCase()).digest("hex");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${name}.txt`), url, "utf8");
    return;
  }
  console.info(
    `\n[auth:dev] Magic sign-in link (dev only, not emailed):\n${url}\n`,
  );
}

function buildProviders(): Provider[] {
  const e = env();
  const providers: Provider[] = [
    Resend({
      apiKey: e.RESEND_API_KEY,
      from: e.EMAIL_FROM,
      ...(e.RESEND_API_KEY && !e.E2E_MAGIC_LINK_DIR
        ? {}
        : {
            sendVerificationRequest: ({ identifier, url }) =>
              deliverMagicLinkLocally(identifier, url),
          }),
    }),
  ];

  if (googleAuthEnabled()) {
    providers.push(
      Google({
        clientId: e.AUTH_GOOGLE_ID,
        clientSecret: e.AUTH_GOOGLE_SECRET,
        // Sign-in only: never request Gmail scopes.
        authorization: { params: { scope: "openid email profile" } },
        // EC-ACC-02: Google verifies email ownership, so link to an existing
        // magic-link account with the same address.
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  return providers;
}

function buildConfig(): NextAuthConfig {
  return {
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    secret: env().AUTH_SECRET,
    session: { strategy: "database" },
    providers: buildProviders(),
    pages: {
      signIn: "/login",
      verifyRequest: "/login/check-email",
      error: "/login/error",
    },
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
    events: {
      // F1 step 2: every new account gets a forwarding address immediately.
      async createUser({ user }) {
        if (user.id) await ensureForwardingAddress(user.id);
      },
    },
    logger: {
      // EC-ACC-08: log error codes only, never emails or tokens.
      error(error) {
        console.error(`[auth] ${error.name}`);
      },
      warn(code) {
        console.warn(`[auth] warn ${code}`);
      },
      debug() {},
    },
  };
}

// Lazy config so env is validated at request time, not during `next build`.
export const { handlers, auth, signIn, signOut } = NextAuth(() =>
  buildConfig(),
);
