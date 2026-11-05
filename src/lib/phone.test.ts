import { describe, expect, it } from "vitest";
import { mobileOk, nationalMobile, splitMobile } from "./phone";

describe("nationalMobile", () => {
  it("keeps the Indian behaviour", () => {
    expect(["+91 81728 36138", "08172836138", "8172836138"].map((x) => nationalMobile(x))).toEqual(Array(3).fill("8172836138"));
  });
  it("drops another country's calling code and trunk zero", () => {
    expect(nationalMobile("+971 50 123 4567", "971")).toBe("501234567");
    expect(nationalMobile("07911 123456", "44")).toBe("7911123456");
    expect(nationalMobile("501234567", "971")).toBe("501234567");
  });
});

describe("splitMobile", () => {
  it("reads the code from a + or 00 prefix", () => {
    expect(splitMobile("+971 50 123 4567")).toEqual({ code: "971", national: "501234567" });
    expect(splitMobile("00447911123456")).toEqual({ code: "44", national: "7911123456" });
    expect(splitMobile("+1 415 555 1234")).toEqual({ code: "1", national: "4155551234" });
    expect(splitMobile("+91 81728 36138")).toEqual({ code: "91", national: "8172836138" });
  });
  it("treats a plain number as Indian", () => {
    expect(splitMobile("8172836138")).toEqual({ code: "91", national: "8172836138" });
    expect(splitMobile("")).toEqual({ code: "91", national: "" });
  });
});

describe("mobileOk", () => {
  it("wants 10 digits for India and 6-14 elsewhere", () => {
    expect(mobileOk("8172836138", "91")).toBe(true);
    expect(mobileOk("81728", "91")).toBe(false);
    expect(mobileOk("501234567", "971")).toBe(true);
    expect(mobileOk("12", "971")).toBe(false);
  });
});
