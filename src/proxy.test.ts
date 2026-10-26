import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const { updateSessionMock } = vi.hoisted(() => ({
  updateSessionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: updateSessionMock,
}));

describe("WhatsApp server requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSessionMock.mockResolvedValue(
      NextResponse.redirect("https://rhinos.example/auth/login")
    );
  });

  it.each([
    ["GET", "/api/webhooks/whatsapp"],
    ["POST", "/api/webhooks/whatsapp"],
    ["POST", "/api/internal/whatsapp-agent/tools/search_catalog"],
  ])("lets %s %s reach its own authentication", async (method, pathname) => {
    const response = await proxy(
      new NextRequest(`https://rhinos.example${pathname}`, { method })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("location")).toBe(false);
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", "/org/acme/whatsapp/conversaciones"],
    ["POST", "/api/org/acme/whatsapp/simulate"],
    ["POST", "/api/webhooks/whatsapp-extra"],
    ["POST", "/api/webhooks/whatsapp/extra"],
    ["POST", "/api/internal/whatsapp-agent/tools"],
    ["POST", "/api/internal/whatsapp-agent/tools/search_catalog/extra"],
    ["GET", "/api/internal/whatsapp-agent/tools/search_catalog"],
    ["DELETE", "/api/webhooks/whatsapp"],
  ])("keeps session authentication for %s %s", async (method, pathname) => {
    const request = new NextRequest(`https://rhinos.example${pathname}`, {
      method,
    });
    const response = await proxy(request);

    expect(updateSessionMock).toHaveBeenCalledExactlyOnceWith(request);
    expect(response.headers.get("location")).toBe(
      "https://rhinos.example/auth/login"
    );
  });
});
