import { describe, expect, it } from "vitest";
import {
  getWaitingWorkerIdentity,
  isSerwistWorkerScript,
  shouldNotifyWaitingWorker,
} from "./pwa-update";

describe("PWA update detection", () => {
  it("uses the waiting worker script URL as its identity", () => {
    expect(
      getWaitingWorkerIdentity({
        scriptURL: "https://example.com/serwist/sw.js",
        state: "installed",
      })
    ).toBe("https://example.com/serwist/sw.js");
  });

  it("ignores absent and redundant workers", () => {
    expect(getWaitingWorkerIdentity(null)).toBeNull();
    expect(
      getWaitingWorkerIdentity({
        scriptURL: "https://example.com/serwist/sw.js",
        state: "redundant",
      })
    ).toBeNull();
  });

  it("notifies once per worker identity", () => {
    const identity = "https://example.com/serwist/sw.js?v=build-2";
    expect(shouldNotifyWaitingWorker(identity, null)).toBe(true);
    expect(shouldNotifyWaitingWorker(identity, identity)).toBe(false);
    expect(shouldNotifyWaitingWorker(null, null)).toBe(false);
  });

  it("accepts only the same-origin Serwist worker script", () => {
    expect(
      isSerwistWorkerScript(
        "https://example.com/serwist/sw.js",
        "https://example.com"
      )
    ).toBe(true);
    expect(
      isSerwistWorkerScript(
        "https://example.com/other/sw.js",
        "https://example.com"
      )
    ).toBe(false);
    expect(
      isSerwistWorkerScript(
        "https://other.com/serwist/sw.js",
        "https://example.com"
      )
    ).toBe(false);
  });
});
