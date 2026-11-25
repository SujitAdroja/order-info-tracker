import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts the minimal dev config and applies defaults", () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.INBOUND_DOMAIN).toBe("in.keeptrack.app");
    expect(env.LLM_DAILY_USER_CAP).toBe(30);
    expect(env.LLM_DAILY_GLOBAL_CAP).toBe(2000);
    expect(env.LLM_PARSE_MODEL).toBe("claude-haiku-5-5");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ ...base, RESEND_API_KEY: "", AUTH_GOOGLE_ID: "" });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.AUTH_GOOGLE_ID).toBeUndefined();
  });

  it("rejects a missing or non-postgres DATABASE_URL", () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => parseEnv({ ...base, DATABASE_URL: "mysql://x/y" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(
      /AUTH_SECRET/,
    );
  });

  it("requires Google id and secret together", () => {
    expect(() => parseEnv({ ...base, AUTH_GOOGLE_ID: "id" })).toThrow(
      /AUTH_GOOGLE_ID/,
    );
    expect(() =>
      parseEnv({ ...base, AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" }),
    ).not.toThrow();
  });

  it("requires an email provider and forbids the e2e link dir in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(
      /RESEND_API_KEY/,
    );
    const prod = {
      ...base,
      NODE_ENV: "production",
      RESEND_API_KEY: "re_x",
      INBOUND_WEBHOOK_USER: "postmark",
      INBOUND_WEBHOOK_PASSWORD: "secret",
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      CRON_SECRET: "cron",
      VAPID_PUBLIC_KEY: "pub",
      VAPID_PRIVATE_KEY: "priv",
      VAPID_SUBJECT: "mailto:support@example.com",
    };
    expect(() => parseEnv(prod)).not.toThrow();
    expect(() => parseEnv({ ...prod, VAPID_PRIVATE_KEY: "" })).toThrow(
      /VAPID_PRIVATE_KEY/,
    );
    expect(() =>
      parseEnv({ ...prod, VAPID_SUBJECT: "support@example.com" }),
    ).toThrow(/VAPID_SUBJECT/);
    expect(() => parseEnv({ ...prod, E2E_MAGIC_LINK_DIR: "/tmp/x" })).toThrow(
      /E2E_MAGIC_LINK_DIR/,
    );
    expect(() => parseEnv({ ...prod, DATA_ENCRYPTION_KEY: "" })).toThrow(
      /DATA_ENCRYPTION_KEY is required/,
    );
    expect(() => parseEnv({ ...prod, CRON_SECRET: undefined })).toThrow(
      /CRON_SECRET/,
    );
  });

  it("needs Resend or Postmark inbound credentials in production", () => {
    const prod = {
      ...base,
      NODE_ENV: "production",
      RESEND_API_KEY: "re_x",
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      CRON_SECRET: "cron",
      VAPID_PUBLIC_KEY: "pub",
      VAPID_PRIVATE_KEY: "priv",
      VAPID_SUBJECT: "mailto:support@example.com",
    };
    expect(() => parseEnv(prod)).toThrow(/RESEND_WEBHOOK_SECRET/);
    expect(() =>
      parseEnv({ ...prod, RESEND_WEBHOOK_SECRET: "whsec_abc" }),
    ).not.toThrow();
    expect(parseEnv(base).RESEND_API_BASE_URL).toBe("https://api.resend.com");
  });

  it("validates DATA_ENCRYPTION_KEY length when set", () => {
    const key32 = Buffer.alloc(32, 1).toString("base64");
    expect(
      parseEnv({ ...base, DATA_ENCRYPTION_KEY: key32 }).DATA_ENCRYPTION_KEY,
    ).toBe(key32);
    expect(() =>
      parseEnv({
        ...base,
        DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
      }),
    ).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("never echoes secret values in the error message", () => {
    const secret = "super-secret-but-too-short";
    expect(() => parseEnv({ ...base, AUTH_SECRET: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});
