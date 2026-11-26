import "server-only";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { audit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { appUrl, escapeHtml, sendEmail } from "@/lib/email/send";
import { env, googleAuthEnabled } from "@/lib/env";
import {
  formatSignInCode,
  generateSignInCode,
  SIGN_IN_CODE_MINUTES,
} from "@/lib/sign-in-code";
import { ensureForwardingAddress } from "@/lib/users";

/**
 * Dev/test-only delivery when no email provider key is set. Production
 * refuses to start without RESEND_API_KEY (see lib/env.ts).
 */
async function deliverMagicLinkLocally(
  email: string,
  url: string,
  code: string,
) {
  const dir = env().E2E_MAGIC_LINK_DIR;
  if (dir) {
    const name = createHash("sha256").update(email.toLowerCase()).digest("hex");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${name}.txt`), url, "utf8");
    await writeFile(path.join(dir, `${name}.code`), code, "utf8");
    return;
  }
  console.info(
    `\n[auth:dev] Sign-in (dev only, not emailed):\n${url}\nCode: ${formatSignInCode(code)}\n`,
  );
}

/** The sign-in email: a link for this device and a code for the installed app. */
async function sendSignInEmail(email: string, url: string, code: string) {
  const shown = formatSignInCode(code);
  const ok = await sendEmail({
    to: email,
    subject: `Your KeepTrack sign-in code: ${shown}`,
    text: [
      "Sign in to KeepTrack",
      "",
      `Your code: ${shown}`,
      "Type it in the KeepTrack app (handy if you installed it on your phone).",
      "",
      `Or open this link: ${url}`,
      "",
      `The code and link work once and expire in ${SIGN_IN_CODE_MINUTES} minutes.`,
      "If you didn't ask to sign in, ignore this email.",
    ].join("\n"),
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">
<h2 style="margin:0 0 12px">Sign in to KeepTrack</h2>
<p>Your code:</p>
<p style="font-size:28px;font-weight:600;letter-spacing:4px;font-family:ui-monospace,monospace">${escapeHtml(shown)}</p>
<p>Type it in the KeepTrack app — handy if you installed it on your phone.</p>
<p>Or <a href="${escapeHtml(url)}">sign in with this link</a>.</p>
<p style="color:#666;font-size:12px">The code and link work once and expire in ${SIGN_IN_CODE_MINUTES} minutes.
If you didn't ask to sign in, ignore this email. ${escapeHtml(appUrl("/"))}</p>
</body></html>`,
  });
  if (!ok) throw new Error("sign_in_email_failed");
}

function buildProviders(): Provider[] {
  const e = env();
  const providers: Provider[] = [
    Resend({
      apiKey: e.RESEND_API_KEY,
      from: e.EMAIL_FROM,
      // The token is also a typeable code (see lib/sign-in-code.ts).
      maxAge: SIGN_IN_CODE_MINUTES * 60,
      generateVerificationToken: generateSignInCode,
      sendVerificationRequest: ({ identifier, url, token }) =>
        e.RESEND_API_KEY && !e.E2E_MAGIC_LINK_DIR
          ? sendSignInEmail(identifier, url, token)
          : deliverMagicLinkLocally(identifier, url, token),
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
      async signIn({ user, account }) {
        if (user.id) {
          await audit(user.id, "auth.sign_in", {
            method: account?.provider ?? null,
          });
        }
      },
      async signOut(message) {
        const userId = "session" in message ? message.session?.userId : null;
        if (userId) await audit(userId, "auth.sign_out");
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
