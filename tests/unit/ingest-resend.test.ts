import { describe, expect, it } from "vitest";
import { isAutoForwarded } from "@/lib/ingest/postmark";
import {
  fetchResendEmail,
  isResendRef,
  ResendFetchError,
  resendReceivedEmailSchema,
  resendRecipients,
  resendToRawEmail,
  resendWebhookSchema,
  signResendPayload,
  verifyResendSignature,
} from "@/lib/ingest/resend";

const SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const NOW = Date.UTC(2026, 10, 25, 12);

function headersFor(body: string, secret = SECRET, now = NOW) {
  const h = signResendPayload(body, secret, "msg_1", now);
  return {
    id: h["svix-id"],
    timestamp: h["svix-timestamp"],
    signature: h["svix-signature"],
  };
}

describe("verifyResendSignature", () => {
  const body = JSON.stringify({
    type: "email.received",
    data: { email_id: "e1" },
  });

  it("accepts a valid signature", () => {
    expect(verifyResendSignature(body, headersFor(body), SECRET, NOW)).toBe(
      true,
    );
  });

  it("rejects a tampered body, wrong secret, missing headers or old timestamp", () => {
    const h = headersFor(body);
    expect(verifyResendSignature(`${body} `, h, SECRET, NOW)).toBe(false);
    const other = `whsec_${Buffer.alloc(32, 8).toString("base64")}`;
    expect(
      verifyResendSignature(body, headersFor(body, other), SECRET, NOW),
    ).toBe(false);
    expect(
      verifyResendSignature(body, { ...h, signature: null }, SECRET, NOW),
    ).toBe(false);
    expect(verifyResendSignature(body, h, SECRET, NOW + 6 * 60_000)).toBe(
      false,
    ); // replay
  });

  it("accepts any matching entry when the secret was rotated", () => {
    const h = headersFor(body);
    const rotated = { ...h, signature: `v1,AAAA ${h.signature}` };
    expect(verifyResendSignature(body, rotated, SECRET, NOW)).toBe(true);
  });
});

describe("Resend webhook payload", () => {
  const payload = {
    type: "email.received",
    created_at: "2026-11-25T10:00:00.000Z",
    data: {
      email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
      from: "Me <me@gmail.com>",
      to: ["me@gmail.com"],
      cc: [],
      bcc: [],
      received_for: ["U-ABCDEFGH@abc.resend.app"],
      message_id: "<1@x>",
      subject: "Fwd: Your order",
      attachments: [],
    },
  };

  it("parses and lists recipients, received_for first and lowercased", () => {
    const parsed = resendWebhookSchema.parse(payload);
    expect(resendRecipients(parsed.data)).toEqual([
      "u-abcdefgh@abc.resend.app",
      "me@gmail.com",
    ]);
  });

  it("tolerates missing optional arrays", () => {
    const parsed = resendWebhookSchema.parse({
      type: "email.received",
      data: { email_id: "x", from: "a@b.co" },
    });
    expect(parsed.data.to).toEqual([]);
  });

  it("recognises stored refs", () => {
    expect(isResendRef({ provider: "resend", emailId: "x" })).toBe(true);
    expect(isResendRef({ from: "a", to: [] })).toBe(false);
  });
});

const receivedEmail = {
  object: "email",
  id: "e1",
  to: ["me@gmail.com"],
  from: "me@gmail.com",
  created_at: "2026-11-25T10:00:00.000Z",
  subject: "Your Amazon.in order",
  html: "<p>Order #403-1234567-1234567</p>",
  text: null,
  headers: {
    from: "Amazon.in <auto-confirm@amazon.in>",
    date: "Tue, 24 Nov 2026 09:00:00 +0530",
    "X-Forwarded-For": "me@gmail.com u-abcdefgh@abc.resend.app",
    received: ["a", "b"],
  },
  received_for: ["u-abcdefgh@abc.resend.app"],
  attachments: [
    {
      id: "a1",
      filename: "invoice.pdf",
      content_type: "application/pdf",
      size: 10,
    },
    { id: "a2", filename: "logo.png", content_type: "image/png", size: 10 },
  ],
};

describe("resendToRawEmail", () => {
  it("keeps the display-name From, date and forwarding headers only", () => {
    const raw = resendToRawEmail(
      resendReceivedEmailSchema.parse(receivedEmail),
      [],
    );
    expect(raw.from).toBe("Amazon.in <auto-confirm@amazon.in>");
    expect(raw.date).toBe("Tue, 24 Nov 2026 09:00:00 +0530");
    expect(raw.headers.map((h) => h.name)).toEqual(["X-Forwarded-For"]);
    expect(raw.to).toContain("u-abcdefgh@abc.resend.app");
    expect(isAutoForwarded(raw)).toBe(true);
  });
});

function mockFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = Object.keys(routes).find((k) => url.startsWith(k));
    if (!route) return new Response("nope", { status: 404 });
    return routes[route]();
  }) as typeof fetch;
  return { f, calls };
}

const BASE = "https://api.test";
const deps = (f: typeof fetch) => ({
  apiKey: "re_test",
  baseUrl: BASE,
  fetchImpl: f,
});

describe("fetchResendEmail", () => {
  it("fetches the email and downloads PDF attachments only", async () => {
    const pdf = Buffer.from("%PDF-1.4 test");
    const { f, calls } = mockFetch({
      [`${BASE}/emails/receiving/e1/attachments`]: () =>
        Response.json({
          object: "list",
          has_more: false,
          data: [
            {
              id: "a1",
              filename: "invoice.pdf",
              content_type: "application/pdf",
              size: pdf.length,
              download_url: "https://cdn.test/a1",
            },
            {
              id: "a2",
              filename: "logo.png",
              content_type: "image/png",
              size: 10,
              download_url: "https://cdn.test/a2",
            },
          ],
        }),
      [`${BASE}/emails/receiving/e1`]: () => Response.json(receivedEmail),
      "https://cdn.test/a1": () => new Response(pdf),
    });
    const raw = await fetchResendEmail("e1", deps(f));
    expect(raw.html).toContain("403-1234567-1234567");
    expect(raw.pdfAttachments).toEqual([
      { name: "invoice.pdf", base64: pdf.toString("base64") },
    ]);
    expect(calls).not.toContain("https://cdn.test/a2");
  });

  it("skips the attachment call when there are no PDFs", async () => {
    const { f, calls } = mockFetch({
      [`${BASE}/emails/receiving/e1`]: () =>
        Response.json({ ...receivedEmail, attachments: [] }),
    });
    await fetchResendEmail("e1", deps(f));
    expect(calls).toHaveLength(1);
  });

  it("classifies failures", async () => {
    const fail = async (status: number) => {
      const { f } = mockFetch({
        [`${BASE}/`]: () => new Response("x", { status }),
      });
      return fetchResendEmail("e1", deps(f)).catch(
        (e: unknown) => e as ResendFetchError,
      );
    };
    expect(await fail(404)).toMatchObject({
      code: "provider_not_found",
      retryable: false,
    });
    expect(await fail(500)).toMatchObject({
      code: "provider_unavailable",
      retryable: true,
    });
    expect(await fail(401)).toMatchObject({
      code: "provider_unauthorized",
      retryable: true,
    });

    const { f } = mockFetch({
      [`${BASE}/`]: () => Response.json({ unexpected: true }),
    });
    await expect(fetchResendEmail("e1", deps(f))).rejects.toMatchObject({
      code: "provider_bad_response",
    });

    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchResendEmail("e1", deps(down))).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });
});
