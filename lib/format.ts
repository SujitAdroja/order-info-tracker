/** Money in its own currency; we never convert (EC-ING-12). */
export function formatMoney(
  amount: string | number | null,
  currency: string | null,
): string | null {
  if (amount === null || amount === "") return null;
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return null;
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
