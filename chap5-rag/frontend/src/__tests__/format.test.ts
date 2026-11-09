import { describe, expect, it } from "vitest";

import { formatTimestamp, safeExternalUrl } from "@/lib/format";

describe("safeExternalUrl", () => {
  it("accepts http and https only", () => {
    expect(safeExternalUrl("https://www.cdc.gov/diabetes")).toBe("https://www.cdc.gov/diabetes");
    expect(safeExternalUrl("http://localhost:3100/x")).toBe("http://localhost:3100/x");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("ftp://example.com/a")).toBeNull();
    expect(safeExternalUrl("không phải url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("formats in Vietnam time and falls back on bad input", () => {
    expect(formatTimestamp("2026-10-26T08:00:00+00:00")).toBe("15:00 26/10/2026");
    expect(formatTimestamp("hôm qua")).toBe("Chưa cập nhật");
    expect(formatTimestamp(undefined, "—")).toBe("—");
  });
});
