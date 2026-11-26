"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createPurchaseAction,
  updatePurchaseAction,
  type SavePurchaseResult,
} from "@/app/actions/purchases";
import { OnlineButton } from "@/components/pwa/online-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CURRENCIES,
  MAX_ITEMS_PER_PURCHASE,
  WARRANTY_DEFAULT_MONTHS,
  type Category,
} from "@/lib/purchases/constants";
import {
  emptyItem,
  type ItemFormValues,
  type PurchaseFormValues,
} from "@/lib/purchases/form-values";
import type { FieldErrors } from "@/lib/purchases/input";
import { storeWindowHint } from "@/lib/purchases/policy-hint";
import type { StoreOption } from "@/lib/purchases/service";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function PurchaseForm({
  purchaseId,
  initial,
  stores,
  submitLabel,
}: {
  purchaseId?: string;
  initial: PurchaseFormValues;
  stores: StoreOption[];
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const storeListId = useId();

  const matchedStore = useMemo(
    () =>
      stores.find(
        (s) => s.name.toLowerCase() === values.storeName.trim().toLowerCase(),
      ) ?? null,
    [stores, values.storeName],
  );

  const set = <K extends keyof PurchaseFormValues>(
    key: K,
    value: PurchaseFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  const setItem = (key: string, patch: Partial<ItemFormValues>) =>
    setValues((v) => ({
      ...v,
      items: v.items.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // The zod schema strips client-only fields like `key`.
    const payload = values;
    startTransition(async () => {
      const result: SavePurchaseResult = purchaseId
        ? await updatePurchaseAction(purchaseId, payload)
        : await createPurchaseAction(payload);
      if (result && !result.ok) {
        setErrors(result.errors);
        // Move focus to the first invalid field for keyboard/screen-reader users.
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(),
        );
      }
    });
  }

  const { hint: windowHint, placeholder: windowPlaceholder } = storeWindowHint(
    matchedStore,
    values.items.map((i) => i.category),
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-8">
      {errors._form ? (
        <p role="alert" className="text-sm text-destructive">
          {errors._form}
        </p>
      ) : null}

      <fieldset className="grid gap-4" disabled={pending}>
        <legend className="mb-2 font-medium">Purchase</legend>

        <Field id="storeName" label="Store" required error={errors.storeName}>
          <Input
            id="storeName"
            list={storeListId}
            autoComplete="off"
            placeholder="e.g. Amazon.in, or any shop"
            value={values.storeName}
            onChange={(e) => set("storeName", e.target.value)}
            {...invalid("storeName", errors)}
          />
          <datalist id={storeListId}>
            {stores.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="orderDate"
            label="Order date"
            required
            error={errors.orderDate}
          >
            <Input
              id="orderDate"
              type="date"
              value={values.orderDate}
              onChange={(e) => set("orderDate", e.target.value)}
              {...invalid("orderDate", errors)}
            />
          </Field>
          <Field
            id="deliveryDate"
            label="Delivery date"
            error={errors.deliveryDate}
            hint="Not arrived yet? Leave blank (or enter the expected date) and it shows under Orders until it's delivered."
          >
            <Input
              id="deliveryDate"
              type="date"
              value={values.deliveryDate}
              onChange={(e) => set("deliveryDate", e.target.value)}
              {...invalid("deliveryDate", errors)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="returnWindowDays"
            label="Return window (days)"
            error={errors.returnWindowDays}
            hint={windowHint}
          >
            <Input
              id="returnWindowDays"
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              placeholder={windowPlaceholder}
              value={values.returnWindowDays}
              disabled={values.nonReturnable}
              onChange={(e) => set("returnWindowDays", e.target.value)}
              {...invalid("returnWindowDays", errors)}
            />
          </Field>
          <Field id="currency" label="Currency" error={errors.currency}>
            <select
              id="currency"
              className={selectClass}
              value={values.currency}
              onChange={(e) => set("currency", e.target.value)}
              {...invalid("currency", errors)}
            >
              {[...new Set([values.currency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={values.nonReturnable}
            onChange={(e) => set("nonReturnable", e.target.checked)}
          />
          Final sale / can&apos;t be returned
        </label>

        <Field
          id="externalOrderId"
          label="Order number"
          error={errors.externalOrderId}
          hint="Optional. Helps us match later emails about this order."
        >
          <Input
            id="externalOrderId"
            autoComplete="off"
            value={values.externalOrderId}
            onChange={(e) => set("externalOrderId", e.target.value)}
            {...invalid("externalOrderId", errors)}
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4" disabled={pending}>
        <legend className="mb-2 font-medium">Items</legend>
        {errors.items ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.items}
          </p>
        ) : null}

        {values.items.map((item, index) => (
          <ItemFields
            key={item.key}
            index={index}
            item={item}
            errors={errors}
            showStatus={!!purchaseId}
            canRemove={values.items.length > 1}
            onChange={(patch) => setItem(item.key, patch)}
            onRemove={() =>
              setValues((v) => ({
                ...v,
                items: v.items.filter((it) => it.key !== item.key),
              }))
            }
          />
        ))}

        {values.items.length < MAX_ITEMS_PER_PURCHASE ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => set("items", [...values.items, emptyItem()])}
          >
            <PlusIcon aria-hidden />
            {values.items.length ? "Add another item" : "Add an item"}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4" disabled={pending}>
        <Field
          id="notes"
          label="Notes"
          error={errors.notes}
          hint="e.g. gift, seller name"
        >
          <Textarea
            id="notes"
            rows={3}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            {...invalid("notes", errors)}
          />
        </Field>
      </fieldset>

      <div className="flex gap-3">
        <OnlineButton type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </OnlineButton>
      </div>
    </form>
  );
}

function ItemFields({
  index,
  item,
  errors,
  showStatus,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  item: ItemFormValues;
  errors: FieldErrors;
  showStatus: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<ItemFormValues>) => void;
  onRemove: () => void;
}) {
  const p = `items.${index}`;
  const id = (f: string) => `item-${index}-${f}`;
  const defaultMonths = WARRANTY_DEFAULT_MONTHS[item.category as Category];

  return (
    <div className="grid gap-4 rounded-xl border p-4" data-testid="item-fields">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Item {index + 1}
        </span>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove item ${index + 1}`}
          >
            <Trash2Icon aria-hidden />
            Remove
          </Button>
        ) : null}
      </div>

      <Field
        id={id("name")}
        label="Item name"
        required
        error={errors[`${p}.name`]}
      >
        <Input
          id={id("name")}
          value={item.name}
          placeholder="e.g. Boat Airdopes 141"
          onChange={(e) => onChange({ name: e.target.value })}
          {...invalid(`${p}.name`, errors)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field
          id={id("category")}
          label="Category"
          error={errors[`${p}.category`]}
        >
          <select
            id={id("category")}
            className={selectClass}
            value={item.category}
            onChange={(e) => onChange({ category: e.target.value })}
          >
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={id("unitPrice")}
          label="Price"
          error={errors[`${p}.unitPrice`]}
        >
          <Input
            id={id("unitPrice")}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={item.unitPrice}
            onChange={(e) => onChange({ unitPrice: e.target.value })}
            {...invalid(`${p}.unitPrice`, errors)}
          />
        </Field>
        <Field id={id("quantity")} label="Qty" error={errors[`${p}.quantity`]}>
          <Input
            id={id("quantity")}
            type="number"
            inputMode="numeric"
            min={1}
            value={item.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            {...invalid(`${p}.quantity`, errors)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={id("warrantyMonths")}
          label="Warranty (months)"
          error={errors[`${p}.warrantyMonths`]}
          hint={
            defaultMonths
              ? `Blank uses the usual ${defaultMonths} months for this category.`
              : "Blank if there's no warranty."
          }
        >
          <Input
            id={id("warrantyMonths")}
            type="number"
            inputMode="numeric"
            min={0}
            max={240}
            placeholder={defaultMonths ? String(defaultMonths) : undefined}
            value={item.warrantyMonths}
            onChange={(e) => onChange({ warrantyMonths: e.target.value })}
            {...invalid(`${p}.warrantyMonths`, errors)}
          />
        </Field>
        <Field
          id={id("serialNumber")}
          label="Serial number"
          error={errors[`${p}.serialNumber`]}
        >
          <Input
            id={id("serialNumber")}
            autoComplete="off"
            value={item.serialNumber}
            onChange={(e) => onChange({ serialNumber: e.target.value })}
            {...invalid(`${p}.serialNumber`, errors)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={id("extendedWarrantyEnd")}
          label="Extended warranty until"
          error={errors[`${p}.extendedWarrantyEnd`]}
          hint="Only if you bought one separately."
        >
          <Input
            id={id("extendedWarrantyEnd")}
            type="date"
            value={item.extendedWarrantyEnd}
            onChange={(e) => onChange({ extendedWarrantyEnd: e.target.value })}
            {...invalid(`${p}.extendedWarrantyEnd`, errors)}
          />
        </Field>
        {showStatus ? (
          <Field id={id("itemStatus")} label="Item status">
            <select
              id={id("itemStatus")}
              className={selectClass}
              value={item.itemStatus}
              onChange={(e) =>
                onChange({
                  itemStatus: e.target.value as ItemFormValues["itemStatus"],
                })
              }
            >
              <option value="active">Active</option>
              <option value="kept">Keeping it</option>
              <option value="returned">Returned</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
        ) : null}
      </div>
    </div>
  );
}

function invalid(key: string, errors: FieldErrors) {
  return errors[key]
    ? {
        "aria-invalid": true as const,
        "aria-describedby": `${key.replaceAll(".", "-")}-error`,
      }
    : {};
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  // Error ids mirror the field-error keys (dots → dashes) used by `invalid()`.
  const errorKey = id.replace(/^item-(\d+)-/, "items-$1-");
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p id={`${errorKey}-error`} className={cn("text-sm text-destructive")}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
