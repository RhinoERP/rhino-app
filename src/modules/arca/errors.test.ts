import { describe, expect, it } from "vitest";
import { ArcaValidationError, isDefinitiveArcaRejection } from "./errors";

describe("isDefinitiveArcaRejection", () => {
  it("recognizes the SDK numeric code for an ARCA rejection", () => {
    const error = Object.assign(new Error("(10070) falta el objeto IVA"), {
      code: 10_070,
    });

    expect(isDefinitiveArcaRejection(error)).toBe(true);
  });

  it("recognizes numeric codes serialized as strings", () => {
    expect(
      isDefinitiveArcaRejection(
        Object.assign(new Error("Rechazo ARCA"), { code: "10070" })
      )
    ).toBe(true);
  });

  it("recognizes local fiscal validation errors", () => {
    expect(isDefinitiveArcaRejection(new ArcaValidationError("Inválido"))).toBe(
      true
    );
  });

  it.each([
    "ECONNABORTED",
    "ERR_NETWORK",
    undefined,
  ])("keeps transport and unclassified errors indeterminate (%s)", (code) => {
    const error = Object.assign(new Error("Error de red"), { code });
    expect(isDefinitiveArcaRejection(error)).toBe(false);
  });
});
