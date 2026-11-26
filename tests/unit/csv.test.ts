import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("CSV export", () => {
  it("quotes commas, quotes and newlines (RFC 4180)", () => {
    expect(csvCell('Kettle, 1.5L "steel"')).toBe('"Kettle, 1.5L ""steel"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(["a", "b"])).toBe("a; b");
    expect(csvCell(new Date("2026-11-25T10:00:00Z"))).toBe(
      "2026-11-25T10:00:00.000Z",
    );
  });

  it("neutralises spreadsheet formulas from untrusted text (CSV injection)", () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(
      '"\'=HYPERLINK(""http://evil"")"',
    );
    expect(csvCell("+1 phone")).toBe("'+1 phone");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("Normal name")).toBe("Normal name");
  });

  it("writes a header row and CRLF line endings", () => {
    expect(toCsv([{ a: 1, b: "x" }], ["a", "b"])).toBe("a,b\r\n1,x\r\n");
  });
});
