import { describe, expect, it } from "vitest";
import { fieldsAtPosition } from "@/lib/paymentLinkFields";

describe("payment link question placement", () => {
  it("places selected questions at the beginning, preserving order and conditions", () => {
    const fields = [
      { id: "end", position: "end" },
      { id: "eligibility", position: "beginning", required: true, blocked_options: ["No"] },
      { id: "consent", position: "beginning" },
    ];
    expect(fieldsAtPosition(fields, "beginning")).toEqual([fields[1], fields[2]]);
  });

  it("keeps existing questions without a placement at the end", () => {
    const fields = [{ id: "legacy" }, { id: "first", position: "beginning" }, { id: "last", position: "end" }];
    expect(fieldsAtPosition(fields, "end")).toEqual([fields[0], fields[2]]);
  });
});