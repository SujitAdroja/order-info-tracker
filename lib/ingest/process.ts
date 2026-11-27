import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { inboundEmails, users } from "@/lib/db/schema";
import { addDaysISO, todayInTimeZone, type ISODate } from "@/lib/dates";
import { decrypt } from "@/lib/crypto";
import { env, llmEnabled } from "@/lib/env";
import { classifyEmail, isOutForDelivery } from "@/lib/ingest/classify";
import { genericExtract } from "@/lib/ingest/generic-extract";
import {
  extractGmailConfirmation,
  isGmailVerification,
} from "@/lib/ingest/gmail-verification";
import {
  capText,
  htmlToText,
  looksImageOnly,
  normalizeText,
  stripInvisible,
} from "@/lib/ingest/html-to-text";
import {
  anthropicModelCall,
  llmExtract,
  type ModelCall,
} from "@/lib/ingest/llm";
import { LOW_CONFIDENCE, type ReviewReason } from "@/lib/ingest/merge";
import { checkOrderDateBounds } from "@/lib/purchases/input";
import { pdfToText } from "@/lib/ingest/pdf";
import { isAutoForwarded } from "@/lib/ingest/postmark";
import { redact } from "@/lib/ingest/redact";
import {
  fetchResendEmail,
  isResendRef,
  ResendFetchError,
} from "@/lib/ingest/resend";
import { COUNTRY_CURRENCY, matchStore } from "@/lib/ingest/store-match";
import { findTemplate, templateComplete } from "@/lib/ingest/templates";
import type { ParsedOrder, ParseSource, RawEmail } from "@/lib/ingest/types";
import { unwrapForward } from "@/lib/ingest/unwrap";
import { applyOrder } from "@/lib/ingest/upsert";
import { notifyUser } from "@/lib/notify";

/**
 * Section 6.2 processing for one inbound email. Safe to call more than once:
 * it claims the row first, so concurrent calls (webhook `after()` and the
 * retry cron) never process the same email twice.
 *
 * Privacy (EC-ACC-08): logs carry the row id and an error code only.
 */

export const MAX_ATTEMPTS = 4; // first try + 3 retries (EC-ING-17)
export const GMAIL_CODE_TTL_DAYS = 7;

class RetryableError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

type Finish = {
  status: "parsed" | "needs_review" | "ignored";
  emailType: string | null;
  errorCode?: string | null;
  reviewReason?: string | null;
  purchaseId?: string | null;
  fromDomain?: string | null;
};

async function finish(id: string, f: Finish) {
  await getDb()
    .update(inboundEmails)
    .set({
      status: f.status,
      emailType: f.emailType,
      errorCode: f.errorCode ?? null,
      reviewReason: f.reviewReason ?? null,
      purchaseId: f.purchaseId ?? null,
      ...(f.fromDomain ? { fromDomain: f.fromDomain } : {}),
      rawEncrypted: null, // Section 6.2 step 10: raw content gone after processing
      processedAt: new Date(),
    })
    .where(eq(inboundEmails.id, id));
}

/** Atomically moves pending/failed → processing. Returns null if not claimable. */
async function claim(id: string) {
  const [row] = await getDb()
    .update(inboundEmails)
    .set({
      status: "processing",
      attempts: sql`${inboundEmails.attempts} + 1`,
      processedAt: new Date(), // = last attempt started (used by the stuck check)
    })
    .where(
      and(
        eq(inboundEmails.id, id),
        inArray(inboundEmails.status, ["pending", "failed"]),
      ),
    )
    .returning();
  return row ?? null;
}

/** Reserves one LLM parse against the daily caps (Section 6.3 cost guard). */
async function reserveLlmParse(id: string, userId: string): Promise<boolean> {
  const db = getDb();
  const dayStart = sql`date_trunc('day', now())`;
  const [{ userCount, globalCount }] = await db
    .select({
      userCount:
        sql<number>`count(*) filter (where ${inboundEmails.userId} = ${userId})`.mapWith(
          Number,
        ),
      globalCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(inboundEmails)
    .where(gte(inboundEmails.llmParsedAt, dayStart));
  const e = env();
  if (
    userCount >= e.LLM_DAILY_USER_CAP ||
    globalCount >= e.LLM_DAILY_GLOBAL_CAP
  ) {
    return false;
  }
  await db
    .update(inboundEmails)
    .set({ llmParsedAt: new Date() })
    .where(eq(inboundEmails.id, id));
  return true;
}

/** Section 6.2 step 7 sanity checks on dates. */
export function sanitizeOrder(order: ParsedOrder, today: ISODate): ParsedOrder {
  const out = { ...order };
  if (out.order_date && checkOrderDateBounds(out.order_date, today))
    out.order_date = null;
  for (const key of ["delivery_date", "expected_delivery_date"] as const) {
    const d = out[key];
    if (
      d &&
      (d > addDaysISO(today, 400) || (out.order_date && d < out.order_date))
    ) {
      out[key] = null;
    }
  }
  if (out.delivery_date && out.delivery_date > addDaysISO(today, 1)) {
    // A "delivered" date in the future is really an expectation.
    out.expected_delivery_date ??= out.delivery_date;
    out.delivery_date = null;
  }
  return out;
}

function notifyNotAnOrder(userId: string) {
  return notifyUser(userId, {
    title: "This didn't look like an order",
    body: "We couldn't find an order in the email you forwarded. You can add the purchase by hand.",
    url: "/add",
    tag: "not-an-order",
  });
}

/** Section 6.3 cost guard: tell the user once per day that the limit was hit. */
async function notifyLlmCapOnce(userId: string) {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.userId, userId),
        eq(inboundEmails.errorCode, "llm_cap_reached"),
        gte(inboundEmails.processedAt, sql`date_trunc('day', now())`),
      ),
    );
  if (n > 0) return;
  await notifyUser(userId, {
    title: "Automatic reading paused for today",
    body: "You forwarded a lot of emails today. New ones are saved as drafts for you to check; automatic reading resumes tomorrow.",
    url: "/dashboard?tab=review",
    tag: "llm-cap",
  });
}

export async function processInboundEmail(
  id: string,
  deps: {
    modelCall?: ModelCall | null;
    fetchResend?: typeof fetchResendEmail;
  } = {},
): Promise<void> {
  const row = await claim(id);
  if (!row) return;

  try {
    if (!row.rawEncrypted || !row.userId) {
      await finish(id, {
        status: "needs_review",
        emailType: row.emailType,
        errorCode: "raw_unavailable",
        reviewReason: "processing_failed",
      });
      return;
    }
    const e = env();
    if (!e.DATA_ENCRYPTION_KEY)
      throw new RetryableError("encryption_not_configured");
    const stored: unknown = JSON.parse(
      decrypt(row.rawEncrypted, e.DATA_ENCRYPTION_KEY).toString("utf8"),
    );
    let raw: RawEmail;
    if (isResendRef(stored)) {
      // Resend webhooks carry metadata only; fetch the content now. Nothing
      // fetched is written back: it lives in memory for this run only.
      const apiKey = e.RESEND_API_KEY;
      if (!apiKey) throw new RetryableError("provider_not_configured");
      try {
        raw = await (deps.fetchResend ?? fetchResendEmail)(stored.emailId, {
          apiKey,
          baseUrl: e.RESEND_API_BASE_URL,
        });
      } catch (error) {
        if (error instanceof ResendFetchError && !error.retryable) {
          await finish(id, {
            status: "needs_review",
            emailType: row.emailType,
            errorCode: error.code,
            reviewReason: "processing_failed",
          });
          return;
        }
        throw new RetryableError(
          error instanceof ResendFetchError
            ? error.code
            : "provider_unavailable",
        );
      }
    } else {
      raw = stored as RawEmail;
    }

    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.id, row.userId),
      columns: {
        id: true,
        timezone: true,
        defaultCurrency: true,
        deletedAt: true,
      },
    });
    if (!user || user.deletedAt) {
      await finish(id, {
        status: "ignored",
        emailType: null,
        errorCode: "user_gone",
      });
      return;
    }
    const today = todayInTimeZone(user.timezone);

    // Step 3 (done early so unwrapping sees plain text).
    const bodyText = raw.html
      ? htmlToText(raw.html)
      : normalizeText(raw.text ?? "");

    // Step 2: unwrap forwards.
    const original = unwrapForward({
      from: raw.from,
      subject: stripInvisible(raw.subject),
      date: raw.date,
      body: bodyText,
    });

    // Step 1: Gmail forwarding verification (EC-ING-19). Never creates a purchase.
    if (isGmailVerification(original.fromAddress)) {
      // A code (older emails) or Gmail's confirmation link (newer ones).
      const code = extractGmailConfirmation(raw.subject, bodyText);
      if (code) {
        await db
          .update(users)
          .set({
            pendingGmailCode: code,
            pendingGmailCodeExpiresAt: new Date(
              Date.now() + GMAIL_CODE_TTL_DAYS * 86_400_000,
            ),
          })
          .where(eq(users.id, user.id));
      }
      await finish(id, {
        status: code ? "parsed" : "ignored",
        emailType: "gmail_verification",
        errorCode: code ? null : "gmail_code_not_found",
        fromDomain: original.fromDomain,
      });
      return;
    }

    // F2 step 4: first real email arriving through Gmail auto-forwarding.
    if (isAutoForwarded(raw)) {
      await db
        .update(users)
        .set({
          gmailForwardingVerified: true,
          pendingGmailCode: null,
          pendingGmailCodeExpiresAt: null,
        })
        .where(
          and(eq(users.id, user.id), eq(users.gmailForwardingVerified, false)),
        );
    }

    // EC-ING-08: append PDF invoice text.
    let body = original.body;
    let pdfText = "";
    for (const pdf of raw.pdfAttachments) {
      const t = await pdfToText(pdf.base64);
      if (t) pdfText += `\n\n[Attachment: ${pdf.name}]\n${t}`;
    }
    body = capText(body + pdfText);
    const imageOnly = !pdfText && looksImageOnly(raw.html, original.body);
    const forwardedByHand = original.wasForwarded && !isAutoForwarded(raw);

    // Step 4: store.
    const storeRows = await db.query.stores.findMany({
      columns: {
        id: true,
        slug: true,
        name: true,
        country: true,
        senderDomains: true,
      },
    });
    const store = matchStore(original.fromDomain, storeRows);
    const currencyFallback =
      (store?.country && COUNTRY_CURRENCY[store.country]) ||
      user.defaultCurrency;

    // Step 5: classify (rules first).
    let emailType = classifyEmail(original.subject, body);

    // Step 6: template → LLM → generic.
    let orders: ParsedOrder[] = [];
    let source: ParseSource = "generic";
    const extraReasons: ReviewReason[] = imageOnly ? ["image_only"] : [];

    const template = findTemplate(
      store?.slug ?? null,
      original.fromDomain,
      original.subject,
    );
    if (template) {
      emailType = template.classify(body, original.subject) ?? emailType;
      const parsed = template.parse(body, emailType);
      if (parsed && templateComplete(parsed)) {
        orders = [parsed];
        source = "template";
      }
    }

    if (source !== "template" && !imageOnly) {
      const call =
        deps.modelCall !== undefined
          ? deps.modelCall
          : llmEnabled()
            ? anthropicModelCall(e.ANTHROPIC_API_KEY!, e.LLM_PARSE_MODEL)
            : null;
      if (!call) {
        extraReasons.push("llm_unavailable");
      } else if (!(await reserveLlmParse(id, user.id))) {
        extraReasons.push("llm_cap_reached");
        await notifyLlmCapOnce(user.id);
      } else {
        const result = await llmExtract(
          {
            text: redact(body, original.fromDomain),
            subject: original.subject,
            senderDomain: original.fromDomain,
            emailDate: original.date,
          },
          call,
        );
        if (result.ok) {
          orders = result.orders;
          source = "llm";
        } else if (result.retryable) {
          throw new RetryableError(result.error); // EC-ING-17
        } else {
          extraReasons.push("llm_unavailable");
        }
      }
    }

    if (
      source === "llm" &&
      orders.every((o) => o.email_type === "other" && !o.items.length)
    ) {
      // EC-ING-10: only a manual forward gets a notice.
      if (forwardedByHand) await notifyNotAnOrder(user.id);
      await finish(id, {
        status: "ignored",
        emailType: "other",
        errorCode: "not_a_purchase",
        fromDomain: original.fromDomain,
      });
      return;
    }

    if (source === "generic") {
      if (emailType === "other" && !imageOnly) {
        if (forwardedByHand) await notifyNotAnOrder(user.id); // EC-ING-10
        await finish(id, {
          status: "ignored",
          emailType,
          errorCode: "not_a_purchase",
          fromDomain: original.fromDomain,
        });
        return;
      }
      orders = [
        genericExtract({
          type: emailType === "other" ? "order_confirmation" : emailType,
          body,
          emailDate: original.date,
          storeName: store?.name ?? null,
          defaultCurrency: currencyFallback,
          subject: original.subject,
        }),
      ];
      // A complete read (order number, date and items) doesn't need the
      // "automatic reading isn't available" review just because the LLM is off.
      if (orders[0].confidence >= LOW_CONFIDENCE) {
        const i = extraReasons.indexOf("llm_unavailable");
        if (i !== -1) extraReasons.splice(i, 1);
      }
    }

    // Steps 7–9: validate, upsert, recompute.
    const storeName =
      store?.name ??
      orders.find((o) => o.store_name)?.store_name?.slice(0, 100) ??
      original.fromName?.slice(0, 100) ??
      original.fromDomain ??
      "Unknown store";

    let firstPurchaseId: string | null = null;
    let anyApplied = false;
    let anyReview = false;
    let lastIgnoreReason = "not_a_purchase";
    for (const parsed of orders.filter(
      (o) => o.email_type !== "other" || o.items.length,
    )) {
      const order = sanitizeOrder(
        {
          ...parsed,
          email_type:
            parsed.email_type === "other"
              ? "order_confirmation"
              : parsed.email_type,
        },
        today,
      );
      const result = await applyOrder(db, {
        userId: user.id,
        timeZone: user.timezone,
        store: store ? { id: store.id, name: store.name } : null,
        storeName,
        currencyFallback,
        order,
        emailDate: original.date,
        today,
        confidence: order.confidence,
        extraReasons,
        outForDelivery:
          order.email_type === "shipped" &&
          isOutForDelivery(original.subject, body),
      });
      if (result.outcome === "ignored") {
        lastIgnoreReason = result.reason;
        continue;
      }
      anyApplied = true;
      anyReview ||= result.needsReview;
      firstPurchaseId ??= result.purchaseId;
    }

    // EC-ING-09: an image-only email became a draft we couldn't fill in.
    if (imageOnly && anyApplied && firstPurchaseId) {
      await notifyUser(user.id, {
        title: "We couldn't read this email",
        body: "It's mostly images. Please add the details by hand.",
        url: `/purchases/${firstPurchaseId}/edit`,
        tag: `unreadable-${firstPurchaseId}`,
      });
    }

    await finish(id, {
      status: !anyApplied ? "ignored" : anyReview ? "needs_review" : "parsed",
      emailType: orders[0]?.email_type ?? emailType,
      // Recorded so the daily-limit notice goes out once per day.
      errorCode: anyApplied
        ? extraReasons.includes("llm_cap_reached")
          ? "llm_cap_reached"
          : null
        : lastIgnoreReason,
      purchaseId: firstPurchaseId,
      fromDomain: original.fromDomain,
    });
  } catch (error) {
    const code =
      error instanceof RetryableError
        ? error.code
        : (error as { code?: string })?.code === "23505"
          ? "conflict"
          : "processing_error";
    console.error(`[ingest] ${id} ${code}`);
    const exhausted = row.attempts >= MAX_ATTEMPTS;
    await getDb()
      .update(inboundEmails)
      .set(
        exhausted
          ? {
              status: "needs_review",
              errorCode: code,
              reviewReason: "processing_failed",
              rawEncrypted: null,
              processedAt: new Date(),
            }
          : { status: "failed", errorCode: code, processedAt: new Date() },
      )
      .where(eq(inboundEmails.id, id));
  }
}

/** Ids for the retry cron: pending, failed past backoff, or stuck processing. */
export async function retryCandidates(limit = 20): Promise<string[]> {
  const db = getDb();
  // EC-ING-23: stuck in processing > 10 min → back to pending.
  await db
    .update(inboundEmails)
    .set({ status: "pending" })
    .where(
      and(
        eq(inboundEmails.status, "processing"),
        sql`${inboundEmails.processedAt} < now() - interval '10 minutes'`,
      ),
    );
  const rows = await db
    .select({ id: inboundEmails.id })
    .from(inboundEmails)
    .where(
      sql`(
        (${inboundEmails.status} = 'pending' and ${inboundEmails.receivedAt} < now() - interval '1 minute')
        or (${inboundEmails.status} = 'failed' and ${inboundEmails.attempts} < ${MAX_ATTEMPTS} and ${inboundEmails.processedAt} < now() - (
          case ${inboundEmails.attempts} when 1 then interval '5 minutes' when 2 then interval '30 minutes' else interval '120 minutes' end))
      ) and ${inboundEmails.rawEncrypted} is not null`,
    )
    .orderBy(inboundEmails.receivedAt)
    .limit(limit);
  return rows.map((r) => r.id);
}
