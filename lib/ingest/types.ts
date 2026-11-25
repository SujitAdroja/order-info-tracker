import { z } from "zod";
import { CATEGORIES } from "@/lib/purchases/constants";

export const EMAIL_TYPES = [
  "order_confirmation",
  "shipped",
  "delivered",
  "cancelled",
  "refund",
  "return_initiated",
  "invoice",
  "gmail_verification",
  "other",
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

/** What we keep (encrypted, ≤24h) from a provider payload. Never logged. */
export type RawEmail = {
  from: string; // "Name <addr@domain>" or bare address
  to: string[];
  subject: string;
  date: string | null; // RFC 2822 / ISO from the provider
  text: string | null;
  html: string | null;
  headers: { name: string; value: string }[];
  pdfAttachments: { name: string; base64: string }[];
};

/** The original email after unwrapping a forward (Section 6.2 step 2). */
export type OriginalEmail = {
  fromAddress: string | null;
  fromDomain: string | null;
  fromName: string | null;
  subject: string;
  date: string | null; // YYYY-MM-DD when parseable
  body: string; // plain text
  wasForwarded: boolean;
};

const nullableDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

/** One order as extracted by a template, the generic extractor, or the LLM. */
export const parsedOrderSchema = z.object({
  email_type: z.enum(EMAIL_TYPES),
  store_name: z.string().nullable(),
  external_order_id: z.string().nullable(),
  order_date: nullableDate,
  delivery_date: nullableDate,
  expected_delivery_date: nullableDate,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  total_amount: z.number().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int(),
      unit_price: z.number().nullable(),
      category: z.enum(CATEGORIES),
      serial_number: z.string().nullable(),
      warranty_months: z.number().int().nullable(),
      non_returnable: z.boolean(),
    }),
  ),
  return_window_days_stated: z.number().int().nullable(),
  seller_name: z.string().nullable(),
  confidence: z.number(),
});
export type ParsedOrder = z.infer<typeof parsedOrderSchema>;
export type ParsedItem = ParsedOrder["items"][number];

export type ParseSource = "template" | "generic" | "llm";

export type ParseResult = {
  source: ParseSource;
  orders: ParsedOrder[];
};
