import { describe, expect, it } from "vitest";
import { findSector, sectorKeyMatches } from "./ssrKeys";

describe("sectorKeyMatches", () => {
  it("takes the live provider-prefixed key and the guide's bare key", () => {
    expect(sectorKeyMatches("2_DEL$BOM", "DEL", "BOM")).toBe(true);
    expect(sectorKeyMatches("12_DEL$BOM", "DEL", "BOM")).toBe(true);
    expect(sectorKeyMatches("DEL$BOM", "DEL", "BOM")).toBe(true);
  });
  it("does not take another route or a longer code", () => {
    expect(sectorKeyMatches("2_BOM$DEL", "DEL", "BOM")).toBe(false);
    expect(sectorKeyMatches("XDEL$BOM", "DEL", "BOM")).toBe(false);
    expect(sectorKeyMatches("2_DEL$BOMX", "DEL", "BOM")).toBe(false);
  });
  it("needs both airports", () => {
    expect(sectorKeyMatches("DEL$BOM", undefined, "BOM")).toBe(false);
  });
});

describe("findSector", () => {
  it("finds the entry under either key", () => {
    expect(findSector({ "2_DEL$BOM": { a: 1 } }, "DEL", "BOM")).toEqual({ a: 1 });
    expect(findSector({ DEL$BOM: { a: 2 } }, "DEL", "BOM")).toEqual({ a: 2 });
  });
  it("is null for none, and for two (no guessing)", () => {
    expect(findSector({ "2_BOM$DEL": {} }, "DEL", "BOM")).toBeNull();
    expect(findSector({ "1_DEL$BOM": {}, "2_DEL$BOM": {} }, "DEL", "BOM")).toBeNull();
    expect(findSector(null, "DEL", "BOM")).toBeNull();
  });
});
