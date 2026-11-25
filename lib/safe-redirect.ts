/** Only same-origin relative paths are allowed; anything else goes to the dashboard. */
export function safeCallbackUrl(raw: unknown, fallback = "/dashboard"): string {
  if (typeof raw !== "string" || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}
