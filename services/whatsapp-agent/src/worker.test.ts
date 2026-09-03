import { describe, expect, it } from "vitest";
import { retryDelaySeconds } from "./worker";

describe("retryDelaySeconds", () => {
  it("backs off exponentially and caps the delay", () => {
    expect(retryDelaySeconds(1)).toBe(5);
    expect(retryDelaySeconds(4)).toBe(40);
    expect(retryDelaySeconds(10)).toBe(300);
  });
});
