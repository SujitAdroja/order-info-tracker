import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import webpush from "web-push";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
export const MAGIC_LINK_DIR = path.join(
  __dirname,
  "test-results",
  "magic-links",
);

/** Test-only secrets, independent of whatever is in `.env`. */
export const E2E_SECRETS = {
  INBOUND_WEBHOOK_USER: "e2e-postmark",
  INBOUND_WEBHOOK_PASSWORD: "e2e-inbound-password",
  CRON_SECRET: "e2e-cron-secret",
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 42).toString("base64"),
  INBOUND_DOMAIN: "in.keeptrack.app",
  RESEND_WEBHOOK_SECRET: `whsec_${Buffer.alloc(32, 7).toString("base64")}`,
  // Only the local mock below ever sees this key.
  RESEND_API_KEY: "re_e2e_mock",
};

/** Throwaway VAPID keys for the test server (pushes only reach the local mock). */
const vapid = webpush.generateVAPIDKeys();

export const MOCK_RESEND_URL = "http://localhost:3199";

export default defineConfig({
  testDir: "./tests/e2e",
  // Runs against `next dev` (on-demand compiles), so keep it serial with roomy timeouts.
  fullyParallel: false,
  workers: 1,
  timeout: 120_000, // cold dev-mode compiles can take ~45s on first hit
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "node tests/e2e/mocks/resend-api.mjs",
      url: MOCK_RESEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      command: `npx next dev --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        AUTH_URL: baseURL,
        // Magic links are written here instead of emailed (dev/test only).
        E2E_MAGIC_LINK_DIR: MAGIC_LINK_DIR,
        ...E2E_SECRETS,
        RESEND_API_BASE_URL: MOCK_RESEND_URL,
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:e2e@example.test",
        // Every test signs up from localhost.
        SIGNIN_IP_LIMIT_PER_HOUR: "100000",
        // Force plan B (no LLM) so tests are deterministic and never spend money.
        ANTHROPIC_API_KEY: "",
      },
    },
  ],
});
