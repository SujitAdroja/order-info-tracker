import { describe, expect, it } from "vitest";
import {
  formatForwardingAddress,
  forwardingVCard,
  generateLocalPart,
  LOCAL_PART_ALPHABET,
  LOCAL_PART_PATTERN,
} from "@/lib/forwarding";

describe("generateLocalPart", () => {
  it("produces u- followed by 8 unambiguous lowercase chars", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateLocalPart()).toMatch(LOCAL_PART_PATTERN);
    }
  });

  it("excludes look-alike characters", () => {
    for (const c of "01ilo") expect(LOCAL_PART_ALPHABET).not.toContain(c);
  });

  it("uses the injected random source", () => {
    expect(generateLocalPart(() => 0)).toBe("u-aaaaaaaa");
    expect(generateLocalPart((max) => max - 1)).toBe("u-99999999");
  });

  it("is effectively unique across many draws", () => {
    const seen = new Set(
      Array.from({ length: 5000 }, () => generateLocalPart()),
    );
    expect(seen.size).toBe(5000);
  });
});

describe("formatForwardingAddress", () => {
  it("joins local part and lowercased domain", () => {
    expect(formatForwardingAddress("u-7k2m9xqa", "In.KeepTrack.app")).toBe(
      "u-7k2m9xqa@in.keeptrack.app",
    );
  });
});

describe("forwardingVCard (Add to contacts)", () => {
  const card = forwardingVCard("u-7k2m9xqa@in.keeptrack.app");

  it("is a vCard 3.0 named KeepTrack Orders with the address", () => {
    const lines = card.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCARD");
    expect(lines).toContain("VERSION:3.0");
    expect(lines).toContain("FN:KeepTrack Orders");
    expect(lines).toContain("EMAIL;TYPE=INTERNET:u-7k2m9xqa@in.keeptrack.app");
    expect(lines.at(-2)).toBe("END:VCARD");
  });

  it("uses CRLF line endings only", () => {
    expect(card.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  });
});
