import { z } from "zod";

/**
 * Server environment, validated with zod.
 *
 * Validation is lazy (on first access) so `next build` can run without
 * production secrets. Variables for later phases are optional for now and
 * get tightened when those phases land.
 */

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const intFromString = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Database
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    // Auth.js
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
    AUTH_URL: optionalString.pipe(z.url().optional()),
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,

    // Outbound email (magic links now, reminder fallback later)
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: z.string().min(3).default("KeepTrack <no-reply@keeptrack.app>"),

    // Inbound email
    INBOUND_DOMAIN: z
      .string()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "INBOUND_DOMAIN must be a hostname")
      .default("in.keeptrack.app"),
    // Resend inbound (default): webhook signing secret + Receiving API.
    RESEND_WEBHOOK_SECRET: optionalString,
    RESEND_API_BASE_URL: optionalString
      .pipe(z.url().optional())
      .transform((v) => v ?? "https://api.resend.com"),
    // Postmark inbound (alternative): Basic auth on the webhook URL.
    INBOUND_WEBHOOK_USER: optionalString,
    INBOUND_WEBHOOK_PASSWORD: optionalString,

    // LLM (Phase 3+)
    ANTHROPIC_API_KEY: optionalString,
    // Haiku tier per the plan (Section 3). Overridable without a code change.
    LLM_PARSE_MODEL: z
      .string()
      .trim()
      .transform((v) => v || "claude-haiku-5-5")
      .default("claude-haiku-5-5"),
    LLM_DAILY_USER_CAP: intFromString(30),
    LLM_DAILY_GLOBAL_CAP: intFromString(2000),

    // Encryption (Phase 3+). 32 bytes, base64.
    DATA_ENCRYPTION_KEY: optionalString.pipe(
      z
        .string()
        .refine(
          (v) => Buffer.from(v, "base64").length === 32,
          "DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded",
        )
        .optional(),
    ),

    // Push (Phase 5)
    VAPID_PUBLIC_KEY: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: optionalString.pipe(
      z
        .string()
        .regex(
          /^(mailto:|https:\/\/)/,
          "VAPID_SUBJECT must be a mailto: or https:// URL",
        )
        .optional(),
    ),

    // Cron + errors
    CRON_SECRET: optionalString,
    SENTRY_DSN: optionalString,

    // Dev/test only: write magic links to this folder instead of sending.
    E2E_MAGIC_LINK_DIR: optionalString,
  })
  .superRefine((env, ctx) => {
    const googlePair = [env.AUTH_GOOGLE_ID, env.AUTH_GOOGLE_SECRET];
    if (googlePair.filter(Boolean).length === 1) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_GOOGLE_ID"],
        message: "Set both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, or neither",
      });
    }
    if (env.NODE_ENV === "production") {
      const postmark = Boolean(
        env.INBOUND_WEBHOOK_USER && env.INBOUND_WEBHOOK_PASSWORD,
      );
      if (!env.RESEND_WEBHOOK_SECRET && !postmark) {
        ctx.addIssue({
          code: "custom",
          path: ["RESEND_WEBHOOK_SECRET"],
          message:
            "Inbound email needs RESEND_WEBHOOK_SECRET (Resend) or INBOUND_WEBHOOK_USER/PASSWORD (Postmark) in production",
        });
      }
      for (const key of [
        "DATA_ENCRYPTION_KEY",
        "CRON_SECRET",
        "VAPID_PUBLIC_KEY",
        "VAPID_PRIVATE_KEY",
        "VAPID_SUBJECT",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required in production`,
          });
        }
      }
      if (!env.RESEND_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["RESEND_API_KEY"],
          message: "RESEND_API_KEY is required in production (magic links)",
        });
      }
      if (env.E2E_MAGIC_LINK_DIR) {
        ctx.addIssue({
          code: "custom",
          path: ["E2E_MAGIC_LINK_DIR"],
          message: "E2E_MAGIC_LINK_DIR must not be set in production",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Only variable names and messages, never values.
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/**
 * The LLM fallback is optional: without a key, emails that no store template
 * can read become a pre-filled "needs review" draft (plan B).
 */
export function llmEnabled(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}

export function googleAuthEnabled(): boolean {
  const e = env();
  return Boolean(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET);
}
