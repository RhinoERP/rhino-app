import { describe, expect, it } from "vitest";
import { getPwaInstallGuide } from "./pwa-install-guide";

describe("getPwaInstallGuide", () => {
  it("detects Safari on iPhone and gives Safari-specific steps", () => {
    const guide = getPwaInstallGuide(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
    );

    expect(guide?.browser).toBe("safari-ios");
    expect(guide?.steps[0]).toContain("Compartir");
  });

  it("detects Chrome on Android and explains the browser menu", () => {
    const guide = getPwaInstallGuide(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36"
    );

    expect(guide?.browser).toBe("chrome-android");
    expect(guide?.steps[0]).toContain("menu");
  });

  it("detects Chrome on iOS and does not show the Safari guide", () => {
    const guide = getPwaInstallGuide(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/125.0.0.0 Mobile/15E148"
    );

    expect(guide?.browser).toBe("chrome-ios");
    expect(guide?.steps[0]).toContain("Chrome");
  });

  it("detects iPadOS desktop user agent with touch support", () => {
    const guide = getPwaInstallGuide(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      "MacIntel",
      5
    );

    expect(guide?.browser).toBe("safari-ios");
  });

  it("does not treat other browsers as Chrome or Safari", () => {
    expect(
      getPwaInstallGuide(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 EdgA/125.0.0.0 Chrome/125.0.0.0 Mobile Safari/537.36"
      )
    ).toBeNull();
    expect(getPwaInstallGuide("Mozilla/5.0 Firefox/126.0")).toBeNull();
  });
});
