import {
  addDaysISO,
  addMonthsISO,
  endOfDayInTimeZone,
  maxISO,
  type ISODate,
} from "@/lib/dates";
import {
  NON_RETURNABLE_CATEGORIES,
  WARRANTY_DEFAULT_MONTHS,
  type Category,
  type ReturnWindowSource,
} from "@/lib/purchases/constants";

/**
 * Section 8 deadline calculation. Pure: no DB, no clock (`today` is passed in).
 */

export type ItemStatus = "active" | "returned" | "kept" | "cancelled";

export type DeadlineItemInput = {
  category: string | null;
  /** User-entered or parsed warranty; null → category default. */
  warrantyMonths: number | null;
  extendedWarrantyEnd: ISODate | null;
  itemStatus: ItemStatus;
  nonReturnable?: boolean;
};

export type CategoryPolicy = {
  category: string;
  returnDays: number | null;
  nonReturnable: boolean;
};

export type DeadlineInput = {
  orderDate: ISODate;
  /** Actual delivery date, or the expected one when `deliveryDateEstimated`. */
  deliveryDate: ISODate | null;
  deliveryDateEstimated: boolean;
  /** Explicit window: priority 1 (`user`) or 2 (`email`). Null → policies. */
  explicitReturnWindow: {
    days: number;
    source: Extract<ReturnWindowSource, "user" | "email">;
  } | null;
  nonReturnable: boolean;
  store: {
    defaultReturnDays: number | null;
    returnFrom: "delivery" | "order";
  } | null;
  categoryPolicies: CategoryPolicy[];
  items: DeadlineItemInput[];
  timeZone: string;
  today: ISODate;
};

export type ReturnBase = "delivery" | "expected_delivery" | "order";

export type ItemDeadlines = {
  returnWindowDays: number | null;
  returnWindowSource: ReturnWindowSource | null;
  returnDeadline: ISODate | null;
  nonReturnable: boolean;
  /** Whether this item counts toward the purchase's return deadline. */
  returnTracked: boolean;
  warrantyMonths: number | null;
  warrantyMonthsIsDefault: boolean;
  warrantyStart: ISODate | null;
  warrantyEnd: ISODate | null;
  /** Later of warrantyEnd and extendedWarrantyEnd (EC-DATE-12). */
  effectiveWarrantyEnd: ISODate | null;
};

export type ReviewReason = "unknown_return_window";

export type DeadlineResult = {
  returnBase: ReturnBase;
  returnBaseDate: ISODate;
  returnWindowDays: number | null;
  returnWindowSource: ReturnWindowSource | null;
  /** Earliest deadline across tracked items (EC-ING-04). */
  returnDeadline: ISODate | null;
  /** End of the deadline day in the user's timezone, as UTC. */
  returnDeadlineEndsAt: Date | null;
  returnDeadlineEstimated: boolean;
  /** True when no tracked item can be returned. */
  nonReturnable: boolean;
  returnClosed: boolean;
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  latestWarrantyEnd: ISODate | null;
  /** Section 8 status auto-update: nothing left to track. */
  shouldExpire: boolean;
  items: ItemDeadlines[];
};

const RESOLVED_FOR_RETURNS: ReadonlySet<ItemStatus> = new Set([
  "returned",
  "kept",
  "cancelled",
]);
const GONE: ReadonlySet<ItemStatus> = new Set(["returned", "cancelled"]);

function resolveReturnBase(input: DeadlineInput): {
  base: ReturnBase;
  date: ISODate;
  estimated: boolean;
} {
  const { orderDate, deliveryDate, deliveryDateEstimated, store } = input;

  if (store?.returnFrom === "order") {
    return { base: "order", date: orderDate, estimated: false };
  }

  if (!store) {
    // Unknown store: we don't know whether the window counts from order or
    // delivery. Conservative rule: use the earlier (order) date, and flag it
    // estimated unless delivery is known to be the same day.
    const sameDay =
      deliveryDate !== null &&
      !deliveryDateEstimated &&
      deliveryDate === orderDate;
    return { base: "order", date: orderDate, estimated: !sameDay };
  }

  if (deliveryDate && !deliveryDateEstimated) {
    return { base: "delivery", date: deliveryDate, estimated: false };
  }
  if (deliveryDate) {
    // EC-DATE-01: expected delivery known.
    return { base: "expected_delivery", date: deliveryDate, estimated: true };
  }
  return { base: "order", date: orderDate, estimated: true };
}

function resolveItemWindow(
  input: DeadlineInput,
  item: DeadlineItemInput,
): {
  days: number | null;
  source: ReturnWindowSource | null;
  nonReturnable: boolean;
} {
  if (input.nonReturnable || item.nonReturnable) {
    return { days: null, source: null, nonReturnable: true };
  }

  // 1 + 2: user-set or email-stated window.
  if (input.explicitReturnWindow) {
    const { days, source } = input.explicitReturnWindow;
    return { days, source, nonReturnable: days === 0 };
  }

  // 3: store policy for this category.
  const policy = item.category
    ? input.categoryPolicies.find((p) => p.category === item.category)
    : undefined;
  if (policy?.nonReturnable) {
    return { days: null, source: "category", nonReturnable: true };
  }
  if (policy?.returnDays != null) {
    return {
      days: policy.returnDays,
      source: "category",
      nonReturnable: policy.returnDays === 0,
    };
  }

  // EC-ING-25: digital goods default to non-returnable.
  if (item.category && NON_RETURNABLE_CATEGORIES.has(item.category)) {
    return { days: null, source: null, nonReturnable: true };
  }

  // 4: store default.
  const storeDays = input.store?.defaultReturnDays;
  if (storeDays != null) {
    return { days: storeDays, source: "store", nonReturnable: storeDays === 0 };
  }

  // 5: unknown (EC-DATE-04).
  return { days: null, source: null, nonReturnable: false };
}

function resolveWarranty(input: DeadlineInput, item: DeadlineItemInput) {
  const fromItem = item.warrantyMonths;
  const fallback = item.category
    ? WARRANTY_DEFAULT_MONTHS[item.category as Category]
    : undefined;
  const months = fromItem ?? fallback ?? null;

  // Warranty starts on actual delivery (an estimate isn't proof), else order date.
  const start =
    input.deliveryDate && !input.deliveryDateEstimated
      ? input.deliveryDate
      : input.orderDate;

  const end = months && months > 0 ? addMonthsISO(start, months) : null;
  const effective =
    end && item.extendedWarrantyEnd
      ? maxISO(end, item.extendedWarrantyEnd)
      : (end ?? item.extendedWarrantyEnd);

  return {
    warrantyMonths: months,
    warrantyMonthsIsDefault: fromItem == null && fallback != null,
    warrantyStart: months || item.extendedWarrantyEnd ? start : null,
    warrantyEnd: end,
    effectiveWarrantyEnd: effective,
  };
}

export function computeDeadlines(input: DeadlineInput): DeadlineResult {
  const base = resolveReturnBase(input);

  // A purchase with no parsed items still has a return window (one virtual item).
  const items: DeadlineItemInput[] = input.items.length
    ? input.items
    : [
        {
          category: null,
          warrantyMonths: null,
          extendedWarrantyEnd: null,
          itemStatus: "active",
        },
      ];

  const computed: ItemDeadlines[] = items.map((item) => {
    const window = resolveItemWindow(input, item);
    const returnDeadline =
      !window.nonReturnable && window.days != null
        ? addDaysISO(base.date, window.days)
        : null;
    return {
      returnWindowDays: window.days,
      returnWindowSource: window.source,
      returnDeadline,
      nonReturnable: window.nonReturnable,
      returnTracked: !RESOLVED_FOR_RETURNS.has(item.itemStatus),
      ...resolveWarranty(input, item),
    };
  });

  // Purchase-level return deadline: earliest among items still in play (EC-DATE-11).
  const tracked = computed.filter((c) => c.returnTracked);
  const returnable = tracked.filter((c) => !c.nonReturnable);
  const withDeadline = returnable
    .filter((c) => c.returnDeadline !== null)
    .sort((a, b) => a.returnDeadline!.localeCompare(b.returnDeadline!));
  const earliest = withDeadline[0] ?? null;

  const unknownWindow = returnable.some((c) => c.returnWindowDays === null);
  const reviewReasons: ReviewReason[] = unknownWindow
    ? ["unknown_return_window"]
    : [];

  const returnDeadline = earliest?.returnDeadline ?? null;
  const nonReturnable = tracked.length > 0 && returnable.length === 0;
  const returnClosed = returnDeadline !== null && returnDeadline < input.today;

  // Warranty continues for kept items too, not for returned/cancelled ones.
  const latestWarrantyEnd =
    computed
      .filter((_, i) => !GONE.has(items[i].itemStatus))
      .map((c) => c.effectiveWarrantyEnd)
      .filter((d): d is ISODate => d !== null)
      .sort()
      .at(-1) ?? null;

  // Return side is "over" when nothing returnable remains open. An unknown
  // window keeps the purchase open until the user sets it.
  const returnOver =
    !unknownWindow && (returnDeadline === null || returnDeadline < input.today);
  const warrantyOver =
    latestWarrantyEnd === null || latestWarrantyEnd < input.today;

  return {
    returnBase: base.base,
    returnBaseDate: base.date,
    returnWindowDays:
      earliest?.returnWindowDays ?? returnable[0]?.returnWindowDays ?? null,
    returnWindowSource:
      earliest?.returnWindowSource ?? returnable[0]?.returnWindowSource ?? null,
    returnDeadline,
    returnDeadlineEndsAt: returnDeadline
      ? endOfDayInTimeZone(returnDeadline, input.timeZone)
      : null,
    returnDeadlineEstimated: returnDeadline !== null && base.estimated,
    nonReturnable,
    returnClosed,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    latestWarrantyEnd,
    shouldExpire: returnOver && warrantyOver,
    items: computed,
  };
}
