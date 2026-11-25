import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "@/lib/safe-redirect";

describe("safeCallbackUrl", () => {
  it.each([
    ["/settings", "/settings"],
    ["/dashboard?tab=warranty", "/dashboard?tab=warranty"],
  ])("keeps relative path %s", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    123,
    ["/settings"],
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "settings",
    "/" + "a".repeat(600),
  ])("falls back to /dashboard for %j", (input) => {
    expect(safeCallbackUrl(input)).toBe("/dashboard");
  });
});
