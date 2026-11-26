"use client";

import {
  AlertCircleIcon,
  CopyIcon,
  LoaderCircleIcon,
  WifiOffIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  loadMergedDraftAction,
  saveDraftAction,
  updateFromDraftAction,
} from "@/app/actions/drafts";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { SharePreview } from "@/components/shares/share-preview";
import { UploadReceiptButton } from "@/components/shares/upload-receipt-button";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ISODate } from "@/lib/dates";
import {
  newPurchaseValues,
  type PurchaseFormValues,
} from "@/lib/purchases/form-values";
import type { StoreOption } from "@/lib/purchases/service";
import {
  deleteShare,
  getShare,
  putShare,
  type ShareRecord,
} from "@/lib/shares/idb";
import {
  OfflineError,
  readShare,
  type ReadStatus,
} from "@/lib/shares/read-share";
import { fileKind } from "@/lib/shares/rules";
import type { Draft, ExtractResponse } from "@/lib/uploads/types";
import { cn } from "@/lib/utils";

type Failure = Extract<ExtractResponse, { ok: false }>;

type View =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "receive_error" }
  | { kind: "offline" }
  | { kind: "reading"; status: ReadStatus }
  | { kind: "failed"; failure: Failure }
  | { kind: "pick"; drafts: Draft[] }
  | { kind: "review"; queue: Draft[]; index: number; saved: string[] }
  | { kind: "manual" };

export function ShareReview({
  shareId,
  shareError,
  visionEnabled,
  stores,
  today,
  defaultCurrency,
}: {
  shareId: string | null;
  shareError: boolean;
  visionEnabled: boolean;
  stores: StoreOption[];
  today: ISODate;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<ShareRecord | null>(null);
  const [view, setView] = useState<View>(
    shareError
      ? { kind: "receive_error" }
      : shareId
        ? { kind: "loading" }
        : { kind: "missing" },
  );
  const running = useRef(false);

  const read = useCallback(
    async (rec: ShareRecord) => {
      if (running.current) return;
      running.current = true;
      try {
        // EC-SHR-20: already read once (refresh / back button).
        if (rec.result?.ok) return showResult(rec.result);
        if (!navigator.onLine) return setView({ kind: "offline" });
        const result = await readShare(rec, {
          visionEnabled,
          onStatus: (status) => setView({ kind: "reading", status }),
        });
        if (result.ok) await putShare({ ...rec, result }).catch(() => {});
        showResult(result);
      } catch (error) {
        if (error instanceof OfflineError) setView({ kind: "offline" });
        else
          setView({
            kind: "failed",
            failure: {
              ok: false,
              error: "extract_failed",
              retryable: true,
              message: "Couldn't read it right now.",
            },
          });
      } finally {
        running.current = false;
      }

      function showResult(result: ExtractResponse) {
        if (!result.ok) return setView({ kind: "failed", failure: result });
        if (result.drafts.length > 1)
          return setView({ kind: "pick", drafts: result.drafts });
        setView({ kind: "review", queue: result.drafts, index: 0, saved: [] });
      }
    },
    [visionEnabled],
  );

  // Load the share from this device.
  useEffect(() => {
    if (!shareId || shareError) return;
    let cancelled = false;
    getShare(shareId)
      .then((rec) => {
        if (cancelled) return;
        if (!rec) return setView({ kind: "missing" });
        setRecord(rec);
        void read(rec);
      })
      .catch(() => !cancelled && setView({ kind: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [shareId, shareError, read]);

  // EC-SHR-09: offline → read it when the connection is back.
  useEffect(() => {
    if (view.kind !== "offline" || !record) return;
    const onOnline = () => void read(record);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [view.kind, record, read]);

  const discard = async () => {
    if (shareId) await deleteShare(shareId).catch(() => {});
    router.push("/dashboard");
  };

  const source = record?.files.some((f) => fileKind(f) !== "pdf")
    ? "receipt_image"
    : record?.files.length
      ? "receipt_pdf"
      : "manual";

  const finish = async (ids: string[]) => {
    if (shareId) await deleteShare(shareId).catch(() => {});
    if (ids.length === 1) router.push(`/purchases/${ids[0]}`);
    else {
      toast.success(`Added ${ids.length} purchases`);
      router.push("/dashboard");
    }
  };

  const dropped = record?.dropped;
  const notices = [
    dropped?.overLimit ? "Only the first 5 files were used." : null,
    dropped?.unsupported && record?.files.length
      ? "Some files weren't screenshots, photos or PDFs and were skipped."
      : null,
  ].filter(Boolean);

  return (
    <div
      className="grid gap-6"
      data-testid="share-review"
      data-view={view.kind}
    >
      {record ? <SharePreview files={record.files} text={record.text} /> : null}
      {notices.map((n) => (
        <p key={n} role="status" className="text-sm text-muted-foreground">
          {n}
        </p>
      ))}

      {view.kind === "loading" ? (
        <Busy text="Opening what you shared…" />
      ) : null}

      {view.kind === "reading" ? <Busy text={statusText(view.status)} /> : null}

      {view.kind === "missing" ? (
        <Notice
          title="This share has expired or was already saved"
          actions={
            <Link href="/dashboard" className={buttonVariants()}>
              Go to dashboard
            </Link>
          }
        />
      ) : null}

      {view.kind === "receive_error" ? (
        <Notice
          title="Couldn't receive the shared file"
          body="Try sharing it again, or upload it here."
          actions={<UploadReceiptButton />}
        />
      ) : null}

      {view.kind === "offline" ? (
        <Notice
          icon={<WifiOffIcon aria-hidden className="size-5" />}
          title="You're offline"
          body="We'll read this when you're back online. It's saved on this device."
          actions={
            <Button variant="outline" onClick={discard}>
              Discard
            </Button>
          }
        />
      ) : null}

      {view.kind === "failed" ? (
        <FailedView
          failure={view.failure}
          onRetry={record ? () => void read(record) : undefined}
          onManual={() => setView({ kind: "manual" })}
          onDiscard={discard}
        />
      ) : null}

      {view.kind === "pick" ? (
        <PickDrafts
          drafts={view.drafts}
          onDone={(chosen) =>
            setView({ kind: "review", queue: chosen, index: 0, saved: [] })
          }
          onDiscard={discard}
        />
      ) : null}

      {view.kind === "review" ? (
        <DraftReview
          key={view.queue[view.index].key}
          draft={view.queue[view.index]}
          position={
            view.queue.length > 1
              ? `${view.index + 1} of ${view.queue.length}`
              : null
          }
          stores={stores}
          source={source}
          onSaved={(id) => {
            const saved = [...view.saved, id];
            if (view.index + 1 < view.queue.length) {
              setView({ ...view, index: view.index + 1, saved });
            } else void finish(saved);
          }}
          onDiscard={discard}
        />
      ) : null}

      {view.kind === "manual" ? (
        <PurchaseForm
          initial={{
            ...newPurchaseValues(today, defaultCurrency),
            orderDate: "",
          }}
          stores={stores}
          submitLabel="Save purchase"
          hints={{ orderDate: "When did you order this?" }}
          onSave={async (values) => {
            const res = await saveDraftAction(values, source);
            if (!res.ok) return res;
            await finish([res.id]);
          }}
          footer={
            <Button type="button" variant="ghost" size="lg" onClick={discard}>
              Discard
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

function statusText(s: ReadStatus): string {
  if (s.step === "ocr") {
    const pct = Math.round(s.progress * 100);
    return `Reading your order on this device…${pct > 0 ? ` ${pct}%` : ""}`;
  }
  return "Reading your order…";
}

function Busy({ text }: { text: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
      {text}
    </p>
  );
}

function Notice({
  title,
  body,
  icon,
  actions,
  tone = "neutral",
}: {
  title: string;
  body?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <section
      role="status"
      className={cn(
        "grid gap-3 rounded-xl border p-4",
        tone === "warning" &&
          "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
      )}
    >
      <h2 className="flex items-center gap-2 font-medium">
        {icon ?? null}
        {title}
      </h2>
      {body ? (
        <div className="text-sm text-muted-foreground">{body}</div>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

function FailedView({
  failure,
  onRetry,
  onManual,
  onDiscard,
}: {
  failure: Failure;
  onRetry?: () => void;
  onManual: () => void;
  onDiscard: () => void;
}) {
  const manual = (
    <Button
      variant={failure.retryable ? "outline" : "default"}
      onClick={onManual}
    >
      Enter manually
    </Button>
  );
  const discard = (
    <Button variant="ghost" onClick={onDiscard}>
      Discard
    </Button>
  );

  if (failure.error === "link_only") {
    // EC-SHR-01: the link is never fetched.
    return (
      <Notice
        tone="warning"
        icon={<AlertCircleIcon aria-hidden className="size-5" />}
        title="That's only a product link"
        body={
          <div className="grid gap-2">
            <p>{failure.message}</p>
            <ol className="list-decimal pl-5">
              <li>
                Open the order in the shopping app (Your orders → the order).
              </li>
              <li>Take a screenshot, then tap Share → KeepTrack.</li>
            </ol>
          </div>
        }
        actions={
          <>
            {manual}
            {discard}
          </>
        }
      />
    );
  }

  const title =
    failure.error === "not_an_order"
      ? "We couldn't find order details"
      : failure.error === "extract_failed"
        ? "Couldn't read it right now"
        : "We couldn't use that";
  return (
    <Notice
      tone="warning"
      icon={<AlertCircleIcon aria-hidden className="size-5" />}
      title={title}
      body={
        failure.error === "not_an_order"
          ? "You can enter it by hand."
          : failure.message
      }
      actions={
        <>
          {failure.retryable && onRetry ? (
            <Button onClick={onRetry}>Retry</Button>
          ) : null}
          {manual}
          {failure.error === "unsupported" ||
          failure.error === "heic_unsupported" ? (
            <UploadReceiptButton variant="outline" />
          ) : null}
          {discard}
        </>
      }
    />
  );
}

/** EC-SHR-04: a screenshot of an order list → choose which orders to add. */
function PickDrafts({
  drafts,
  onDone,
  onDiscard,
}: {
  drafts: Draft[];
  onDone: (chosen: Draft[]) => void;
  onDiscard: () => void;
}) {
  const [chosen, setChosen] = useState(() => new Set(drafts.map((d) => d.key)));
  return (
    <section className="grid gap-4" aria-labelledby="pick-title">
      <div>
        <h2 id="pick-title" className="font-medium">
          We found {drafts.length} orders
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose the ones to add. You&apos;ll check each one before it&apos;s
          saved.
        </p>
      </div>
      <ul className="grid gap-2">
        {drafts.map((d) => (
          <li key={d.key}>
            <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={chosen.has(d.key)}
                onChange={(e) =>
                  setChosen((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(d.key);
                    else next.delete(d.key);
                    return next;
                  })
                }
              />
              <span className="grid gap-0.5">
                <span className="font-medium">
                  {d.values.items[0]?.name || d.values.storeName || "Order"}
                </span>
                <span className="text-muted-foreground">
                  {[
                    d.values.storeName,
                    d.values.externalOrderId && `#${d.values.externalOrderId}`,
                    d.values.orderDate,
                    d.total !== null && `${d.values.currency} ${d.total}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {d.duplicate ? (
                  <span className="text-amber-800 dark:text-amber-300">
                    Looks like one you already added
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          disabled={chosen.size === 0}
          onClick={() => onDone(drafts.filter((d) => chosen.has(d.key)))}
        >
          Review {chosen.size === 1 ? "1 order" : `${chosen.size} orders`}
        </Button>
        <Button variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </section>
  );
}

function DraftReview({
  draft,
  position,
  stores,
  source,
  onSaved,
  onDiscard,
}: {
  draft: Draft;
  position: string | null;
  stores: StoreOption[];
  source: "receipt_image" | "receipt_pdf" | "manual";
  onSaved: (id: string) => void;
  onDiscard: () => void;
}) {
  // "Update existing" swaps in the old purchase's form, blanks filled from this draft.
  const [mode, setMode] = useState<
    | { kind: "ask" }
    | { kind: "new" }
    | { kind: "update"; purchaseId: string; values: PurchaseFormValues }
  >(draft.duplicate ? { kind: "ask" } : { kind: "new" });
  const [loading, setLoading] = useState(false);

  const check = [...draft.check, ...draft.missing].map((f) =>
    f === "items" ? "items.0.name" : f,
  );
  const needsAttention = draft.missing.length > 0 || draft.check.length > 0;

  return (
    <section className="grid gap-6" aria-label="Order details">
      {position ? (
        <p className="text-sm text-muted-foreground">Order {position}</p>
      ) : null}

      {draft.duplicate && mode.kind === "ask" ? (
        <Notice
          tone="warning"
          icon={<CopyIcon aria-hidden className="size-5" />}
          title="This looks like an order you already added"
          body={
            <>
              <Link
                href={`/purchases/${draft.duplicate.purchaseId}`}
                className="underline underline-offset-2"
                target="_blank"
              >
                {draft.duplicate.title}
              </Link>
              {draft.duplicate.kind === "possible"
                ? " (same store, date and total)"
                : " (same order number)"}
            </>
          }
          actions={
            <>
              <Button
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  const values = await loadMergedDraftAction(
                    draft.duplicate!.purchaseId,
                    draft.values,
                  ).finally(() => setLoading(false));
                  if (values)
                    setMode({
                      kind: "update",
                      purchaseId: draft.duplicate!.purchaseId,
                      values,
                    });
                  else {
                    toast.error("That purchase no longer exists.");
                    setMode({ kind: "new" });
                  }
                }}
              >
                Update existing
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode({ kind: "new" })}
              >
                Add anyway
              </Button>
            </>
          }
        />
      ) : null}

      {mode.kind === "new" ? (
        <>
          {needsAttention ? (
            <p
              className="text-sm text-amber-800 dark:text-amber-300"
              role="status"
            >
              Check the highlighted fields before saving.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              Check the details, then save.
            </p>
          )}
          <PurchaseForm
            initial={draft.values}
            stores={stores}
            submitLabel="Save purchase"
            check={check}
            hints={{
              orderDate: draft.missing.includes("orderDate")
                ? "When did you order this?"
                : undefined,
              storeName: draft.missing.includes("storeName")
                ? "Which store or app was this from?"
                : undefined,
            }}
            onSave={async (values) => {
              const res = await saveDraftAction(values, source);
              if (!res.ok) return res;
              onSaved(res.id);
            }}
            footer={
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={onDiscard}
              >
                Discard
              </Button>
            }
          />
        </>
      ) : null}

      {mode.kind === "update" ? (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            Your existing purchase, with blanks filled from this screenshot.
            Check and save.
          </p>
          <PurchaseForm
            purchaseId={mode.purchaseId}
            initial={mode.values}
            stores={stores}
            submitLabel="Save changes"
            onSave={async (values) => {
              const res = await updateFromDraftAction(mode.purchaseId, values);
              if (!res.ok) return res;
              onSaved(res.id);
            }}
            footer={
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setMode({ kind: "ask" })}
              >
                Back
              </Button>
            }
          />
        </>
      ) : null}
    </section>
  );
}
