import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  clearShares,
  deleteShare,
  getShare,
  listShares,
  putShare,
  type ShareRecord,
} from "@/lib/shares/idb";
import {
  fileKind,
  fitWithin,
  isLinkOnly,
  joinSharedText,
  pickShareFiles,
} from "@/lib/shares/rules";

describe("isLinkOnly (EC-SHR-01)", () => {
  it("flags a bare product link", () => {
    expect(isLinkOnly("https://amzn.in/d/abc123")).toBe(true);
  });

  it("flags a product title + link from a shopping app's Share button", () => {
    expect(
      isLinkOnly(
        "Check out boAt Airdopes 141 Bluetooth TWS Earbuds on Amazon\nhttps://amzn.in/d/0aBcD",
      ),
    ).toBe(true);
    expect(
      isLinkOnly(
        "Look what I found on Flipkart! https://dl.flipkart.com/s/xyz",
      ),
    ).toBe(true);
  });

  it("doesn't flag text with order details, or text without a link", () => {
    expect(
      isLinkOnly(
        "Order ID: 408-1234567-1234567\nTotal ₹1,299\nhttps://amazon.in/your-orders",
      ),
    ).toBe(false);
    expect(isLinkOnly("Order placed on 3 March 2026, total ₹499")).toBe(false);
    expect(isLinkOnly("")).toBe(false);
  });
});

describe("share files", () => {
  const f = (name: string, type: string, size = 10) => ({ name, type, size });

  it("classifies by type, falling back to the extension", () => {
    expect(fileKind(f("a.png", "image/png"))).toBe("image");
    expect(fileKind(f("a.heic", "image/heic"))).toBe("heic");
    expect(fileKind(f("IMG_1.HEIC", ""))).toBe("heic");
    expect(fileKind(f("invoice.pdf", "application/octet-stream"))).toBe("pdf");
    expect(fileKind(f("clip.mp4", "video/mp4"))).toBeNull();
    expect(fileKind(f("notes.docx", "application/msword"))).toBeNull();
  });

  it("keeps the first 5 supported files and reports the rest (EC-SHR-03/12)", () => {
    const files = [
      ...Array.from({ length: 6 }, (_, i) => f(`s${i}.png`, "image/png")),
      f("v.mp4", "video/mp4"),
      f("empty.png", "image/png", 0),
    ];
    const picked = pickShareFiles(files);
    expect(picked.files.map((x) => x.name)).toEqual([
      "s0.png",
      "s1.png",
      "s2.png",
      "s3.png",
      "s4.png",
    ]);
    expect(picked.overLimit).toBe(1);
    expect(picked.unsupported).toBe(2);
  });

  it("joins title/text/url without repeats", () => {
    expect(
      joinSharedText([
        "Airdopes",
        "Airdopes on Amazon https://amzn.in/d/x",
        "https://amzn.in/d/x",
      ]),
    ).toBe("Airdopes on Amazon https://amzn.in/d/x");
  });
});

describe("fitWithin (image resize)", () => {
  it("scales the long edge down to 1600 px", () => {
    expect(fitWithin(1080, 2400)).toEqual({ width: 720, height: 1600 });
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it("never upscales", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("share store (IndexedDB)", () => {
  const record = (id: string, ageDays = 0): ShareRecord => ({
    id,
    createdAt: Date.now() - ageDays * 86_400_000,
    source: "share_target",
    files: [],
    text: `share ${id}`,
  });

  it("puts, gets and deletes", async () => {
    await clearShares();
    await putShare(record("a"));
    expect((await getShare("a"))?.text).toBe("share a");
    await deleteShare("a");
    expect(await getShare("a")).toBeNull();
  });

  it("lists newest first and drops shares older than 7 days (EC-SHR-10)", async () => {
    await clearShares();
    await putShare(record("old", 8));
    await putShare(record("mid", 2));
    await putShare(record("new", 0));
    expect((await listShares()).map((r) => r.id)).toEqual(["new", "mid"]);
    expect(await getShare("old")).toBeNull();
  });

  it("caches the extraction result on the record (EC-SHR-20)", async () => {
    await clearShares();
    await putShare({
      ...record("r"),
      result: { ok: true, method: "ocr", drafts: [] },
    });
    expect((await getShare("r"))?.result).toEqual({
      ok: true,
      method: "ocr",
      drafts: [],
    });
  });
});
