import { describe, expect, it } from "vitest";
import { resolveSiteFormMode } from "./site-form-mode";

describe("customer site form mode", () => {
  it("keeps direct admin editing and lets admins explicitly propose", () => {
    expect(resolveSiteFormMode(true, false)).toBe("saveSite");
    expect(resolveSiteFormMode(true, true)).toBe("proposeSite");
  });

  it("never lets a seller save a site directly", () => {
    expect(resolveSiteFormMode(false, false)).toBe("proposeSite");
    expect(resolveSiteFormMode(false, true)).toBe("proposeSite");
  });
});
