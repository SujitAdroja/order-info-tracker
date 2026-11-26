import "server-only";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { purchaseItems, purchases } from "@/lib/db/schema";
import { addDaysISO, todayInTimeZone } from "@/lib/dates";
import { env, llmEnabled } from "@/lib/env";
import { classifyEmail } from "@/lib/ingest/classify";
import { genericExtract } from "@/lib/ingest/generic-extract";
import {
  anthropicModelCall,
  llmExtract,
  type ModelCall,
} from "@/lib/ingest/llm";
import { pdfToText } from "@/lib/ingest/pdf";
import { sanitizeOrder } from "@/lib/ingest/process";
import { redact } from "@/lib/ingest/redact";
import { COUNTRY_CURRENCY } from "@/lib/ingest/store-match";
import type { ParsedOrder } from "@/lib/ingest/types";
import { consume, rateKey } from "@/lib/rate-limit";
import type { CurrentUser } from "@/lib/session";
import { isLinkOnly } from "@/lib/shares/rules";
import {
  findDuplicate,
  orderToDraft,
  storeFromText,
  type ExistingForDuplicate,
} from "@/lib/uploads/drafts";
import { enrichFromScreenText } from "@/lib/uploads/screen-text";
import type { ExtractMethod, ExtractResponse } from "@/lib/uploads/types";
import {
  anthropicVisionCall,
  visionExtract,
  type VisionCall,
  type VisionImage,
} from "@/lib/uploads/vision";

/**
 * Receipt/screenshot → drafts for the review screen. Nothing is saved here:
 * the user confirms on the review screen. Images and text live in memory for
 * this request only (never stored, never logged).
 *
 * Routing (share spec 3.4):
 * - images → one Claude vision call (only with an API key; otherwise the
 *   device sends OCR text instead)
 * - PDFs → text extraction → text parser
 * - text → link-only check → text parser (LLM when available, else rules)
 */

export type ExtractInput = {
  images: VisionImage[];
  pdfs: Buffer[];
  /** Title/text/url from the share sheet. */
  sharedText: string;
  /** Text the device read off screenshots (OCR, no API key). */
  ocrText: string;
};

export type ExtractDeps = {
  visionCall?: VisionCall | null;
  modelCall?: ModelCall | null;
};

const USER_LLM_DAILY = () => ({
  limit: env().LLM_DAILY_USER_CAP,
  windowSeconds: 24 * 60 * 60,
});

const fail = (
  error: Extract<ExtractResponse, { ok: false }>["error"],
  message: string,
  retryable = false,
): ExtractResponse => ({ ok: false, error, retryable, message });

export function visionAvailable(): boolean {
  return llmEnabled();
}

export async function extractUpload(
  user: CurrentUser,
  input: ExtractInput,
  deps: ExtractDeps = {},
): Promise<ExtractResponse> {
  const today = todayInTimeZone(user.timezone);
  const e = env();

  // PDFs first: their text is context for images too.
  let pdfText = "";
  for (const pdf of input.pdfs) {
    const t = await pdfToText(pdf.toString("base64"));
    if (t) pdfText += `${pdfText ? "\n\n" : ""}${t}`;
  }

  let orders: ParsedOrder[] = [];
  let method: ExtractMethod;
  let text = "";

  if (input.images.length) {
    const call =
      deps.visionCall !== undefined
        ? deps.visionCall
        : llmEnabled()
          ? anthropicVisionCall(e.ANTHROPIC_API_KEY!, e.LLM_PARSE_MODEL)
          : null;
    if (
      !call ||
      !(await consume(rateKey("llm-upload", user.id), USER_LLM_DAILY())).ok
    ) {
      return fail(
        "vision_unavailable",
        "Reading on this device instead.",
        true,
      );
    }
    const result = await visionExtract(
      {
        images: input.images,
        context: redact(
          [input.sharedText, pdfText].filter(Boolean).join("\n\n"),
        ),
        today,
      },
      call,
    );
    if (!result.ok) {
      // Timeout / API down / bad output: the device can still read it (EC-SHR-15).
      return fail(
        "vision_unavailable",
        "Reading on this device instead.",
        true,
      );
    }
    orders = result.orders;
    method = "vision";
    text = [input.sharedText, pdfText].join("\n");
  } else {
    text = [input.ocrText, pdfText, input.sharedText]
      .map((t) => t.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!text) {
      return input.pdfs.length
        ? fail(
            "unreadable",
            "This PDF has no text we can read (it may be a scan). Share a screenshot of it instead.",
          )
        : fail("unreadable", "We couldn't read any text in that.");
    }
    if (!input.ocrText && !pdfText && isLinkOnly(input.sharedText)) {
      return fail(
        "link_only",
        "Shopping apps only share a product link. Take a screenshot of the order page and share that instead.",
      );
    }
    method = input.ocrText ? "ocr" : pdfText ? "pdf" : "text";

    const call =
      deps.modelCall !== undefined
        ? deps.modelCall
        : llmEnabled()
          ? anthropicModelCall(e.ANTHROPIC_API_KEY!, e.LLM_PARSE_MODEL)
          : null;
    let usedLlm = false;
    if (
      call &&
      (await consume(rateKey("llm-upload", user.id), USER_LLM_DAILY())).ok
    ) {
      const result = await llmExtract(
        {
          text: redact(text),
          subject:
            method === "ocr" ? "Screenshot of an order" : "Shared receipt",
          senderDomain: null,
          emailDate: today,
        },
        call,
      );
      if (result.ok) {
        orders = result.orders;
        usedLlm = true;
      }
    }
    if (!usedLlm) {
      const type = classifyEmail("", text);
      const generic = enrichFromScreenText(
        genericExtract({
          type: type === "other" ? "order_confirmation" : type,
          body: text,
          emailDate: null, // a screenshot's date says nothing about the order
          storeName: null,
          defaultCurrency: user.defaultCurrency,
        }),
        text,
        today,
      );
      const foundSomething =
        generic.external_order_id ||
        generic.total_amount !== null ||
        generic.order_date ||
        generic.items.length;
      orders = foundSomething ? [generic] : [];
    }
  }

  orders = orders
    .filter((o) => o.email_type !== "other" || o.items.length)
    .map((o) => sanitizeOrder(o, today));
  if (!orders.length) {
    return fail(
      "not_an_order",
      "We couldn't find order details in that. You can enter it by hand.",
    );
  }

  // Store: named in the text, else what the model read.
  const db = getDb();
  const storeRows = await db.query.stores.findMany({
    columns: {
      id: true,
      slug: true,
      name: true,
      country: true,
      senderDomains: true,
    },
  });
  const preferCountry =
    Object.entries(COUNTRY_CURRENCY).find(
      ([, c]) => c === user.defaultCurrency,
    )?.[0] ?? null;
  const textStore = storeFromText(text, storeRows, preferCountry);

  const drafts = orders.slice(0, 10).map((order, i) => {
    const modelStore = order.store_name
      ? storeFromText(order.store_name, storeRows, preferCountry)
      : null;
    const store = modelStore ?? textStore;
    return orderToDraft(order, {
      key: `d${i}`,
      storeName: store?.name ?? order.store_name,
      currencyFallback:
        (store?.country && COUNTRY_CURRENCY[store.country]) ||
        user.defaultCurrency,
    });
  });

  const existing = await duplicateCandidates(
    user.id,
    drafts.map((d) => ({
      orderId: d.values.externalOrderId,
      orderDate: d.values.orderDate,
    })),
  );
  return {
    ok: true,
    method,
    drafts: drafts.map((d) => ({
      ...d,
      duplicate: findDuplicate(
        {
          storeName: d.values.storeName,
          externalOrderId: d.values.externalOrderId,
          orderDate: d.values.orderDate,
          total: d.total,
        },
        existing,
      ),
    })),
  };
}

/** The user's purchases that could be the same order (by number, or date ±1 day). */
async function duplicateCandidates(
  userId: string,
  keys: { orderId: string; orderDate: string }[],
): Promise<ExistingForDuplicate[]> {
  const conditions = keys.flatMap((k) => [
    ...(k.orderId
      ? [
          sql`upper(regexp_replace(${purchases.externalOrderId}, '[\\s#-]', '', 'g')) = ${k.orderId.replace(/[\s#-]/g, "").toUpperCase()}`,
        ]
      : []),
    ...(k.orderDate
      ? [
          and(
            gte(purchases.orderDate, addDaysISO(k.orderDate, -1)),
            lte(purchases.orderDate, addDaysISO(k.orderDate, 1)),
          ),
        ]
      : []),
  ]);
  if (!conditions.length) return [];
  const rows = await getDb()
    .select({
      id: purchases.id,
      storeName: purchases.storeName,
      externalOrderId: purchases.externalOrderId,
      orderDate: purchases.orderDate,
      totalAmount: purchases.totalAmount,
      firstItem: sql<
        string | null
      >`(select ${purchaseItems.name} from ${purchaseItems} where ${purchaseItems.purchaseId} = ${purchases.id} order by ${purchaseItems.name} limit 1)`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, userId),
        isNull(purchases.deletedAt),
        or(...conditions),
      ),
    )
    .limit(50);
  return rows.map((r) => ({
    ...r,
    title: r.firstItem ?? r.storeName,
  }));
}
