import { describe, expect, it } from "vitest";
import {
  formatSignInCode,
  generateSignInCode,
  normalizeSignInCode,
  SIGN_IN_CODE_ALPHABET,
} from "@/lib/sign-in-code";

describe("sign-in codes", () => {
  it("are 8 unambiguous characters and look random", () => {
    const codes = new Set(Array.from({ length: 500 }, generateSignInCode));
    expect(codes.size).toBe(500);
    for (const c of codes) {
      expect(c).toHaveLength(8);
      for (const ch of c) expect(SIGN_IN_CODE_ALPHABET).toContain(ch);
    }
    expect(SIGN_IN_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it("accept what people type: lower case, dash, spaces", () => {
    expect(normalizeSignInCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeSignInCode(" ABCD EFGH ")).toBe("ABCDEFGH");
    expect(formatSignInCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("reject anything that can't be a code", () => {
    expect(normalizeSignInCode("ABCD-EFG")).toBeNull(); // too short
    expect(normalizeSignInCode("ABCD-EFGO")).toBeNull(); // O isn't used
    expect(normalizeSignInCode("")).toBeNull();
    expect(normalizeSignInCode("ABCD-EFGH-JK")).toBeNull();
  });
});
