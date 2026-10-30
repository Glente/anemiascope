import { describe, expect, it } from "vitest";

import { flagLab, LAB_FIELDS } from "@/lib/case-store";

const field = (key: string) => LAB_FIELDS.find((f) => f.key === key)!;

describe("flagLab", () => {
  it("uses sex-specific hemoglobin limits", () => {
    expect(flagLab(field("hb"), "13", "F")).toBeNull();
    expect(flagLab(field("hb"), "13", "Male")).toBe("low");
    expect(flagLab(field("hb"), "16", "kvinde")).toBe("high");
  });

  it("only flags outside both intervals when sex is unknown", () => {
    expect(flagLab(field("hb"), "13", "")).toBeNull();
    expect(flagLab(field("hb"), "11.2", "")).toBe("low");
  });

  it("accepts decimal comma", () => {
    expect(flagLab(field("hb"), "11,2", "")).toBe("low");
  });

  it("respects < and > qualifiers", () => {
    expect(flagLab(field("hapto"), "<0.1", "")).toBe("low");
    expect(flagLab(field("bili"), "<5", "")).toBeNull();
    expect(flagLab(field("bili"), ">50", "")).toBe("high");
  });

  it("flags one-sided limits", () => {
    expect(flagLab(field("bili"), "45", "")).toBe("high");
    expect(flagLab(field("ema"), "62", "")).toBe("low");
  });

  it("leaves free text alone", () => {
    expect(flagLab(field("dat"), "positive", "")).toBeNull();
    expect(flagLab(field("ekta"), "Reduced Omin", "")).toBeNull();
    expect(flagLab(field("hb"), "", "")).toBeNull();
  });
});
