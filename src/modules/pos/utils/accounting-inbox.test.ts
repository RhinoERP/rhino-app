import { describe, expect, it } from "vitest";
import {
  isPosSaleAccountingActionable,
  resolvePosAccountingInboxAction,
} from "./accounting-inbox";

describe("resolvePosAccountingInboxAction", () => {
  it("ofrece revisar sólo si hay evento guardado", () => {
    expect(
      resolvePosAccountingInboxAction({
        accountingStatus: "REVIEW_REQUIRED",
        arcaStatus: null,
        hasEventSnapshot: true,
      })
    ).toBe("review");
    expect(
      resolvePosAccountingInboxAction({
        accountingStatus: "REVIEW_REQUIRED",
        arcaStatus: null,
        hasEventSnapshot: false,
      })
    ).toBe("unavailable");
  });

  it("formaliza PENDING sólo con la factura autorizada", () => {
    expect(
      resolvePosAccountingInboxAction({
        accountingStatus: "PENDING",
        arcaStatus: "authorized",
        hasEventSnapshot: true,
      })
    ).toBe("formalize");
    expect(
      resolvePosAccountingInboxAction({
        accountingStatus: "PENDING",
        arcaStatus: "pending",
        hasEventSnapshot: true,
      })
    ).toBe("wait");
  });

  it("revisa errores con evento y formaliza las formalizaciones fallidas", () => {
    expect(
      resolvePosAccountingInboxAction({
        accountingStatus: "ERROR",
        arcaStatus: null,
        hasEventSnapshot: true,
      })
    ).toBe("review");
    expect(
      resolvePosAccountingInboxAction({
        accountingStatus: "ERROR",
        arcaStatus: null,
        hasEventSnapshot: false,
      })
    ).toBe("unavailable");
    expect(
      resolvePosAccountingInboxAction({
        accountingStatus: "FORMALIZATION_ERROR",
        arcaStatus: "authorized",
        hasEventSnapshot: true,
      })
    ).toBe("formalize");
  });
});

describe("isPosSaleAccountingActionable", () => {
  it("excluye estados resueltos", () => {
    expect(isPosSaleAccountingActionable("POSTED")).toBe(false);
    expect(isPosSaleAccountingActionable("SETTLED_INFORMAL")).toBe(false);
    expect(isPosSaleAccountingActionable("NOT_REQUIRED")).toBe(false);
    expect(isPosSaleAccountingActionable(null)).toBe(false);
    expect(isPosSaleAccountingActionable("ERROR")).toBe(true);
  });
});
