import { describe, expect, it } from "vitest";
import { noSupplierAnswered } from "./searchOutage";

describe("noSupplierAnswered", () => {
  it("is true for an empty answer that names no supplier and no error", () => {
    expect(noSupplierAnswered({ searchResult: {}, errors: [], supplierTraceIds: {}, searchKey: "k" }, 0)).toBe(true);
    expect(noSupplierAnswered({ supplierTraceIds: {} }, 0)).toBe(true);
  });
  it("is false when a supplier answered, even with no seats", () => {
    expect(noSupplierAnswered({ errors: [], supplierTraceIds: { tbo: "abc" } }, 0)).toBe(false);
  });
  it("is false when there are flights", () => {
    expect(noSupplierAnswered({ errors: [], supplierTraceIds: {} }, 3)).toBe(false);
  });
  it("is false when Tripsure named a failure (that is shown as 'some suppliers failed')", () => {
    expect(noSupplierAnswered({ errors: [{ message: "x" }], supplierTraceIds: {} }, 0)).toBe(false);
  });
  it("claims nothing when the answer has no supplier field at all, or is not an object", () => {
    for (const r of [{}, { errors: [] }, null, undefined, "x", { supplierTraceIds: null }]) expect(noSupplierAnswered(r, 0)).toBe(false);
  });
});
