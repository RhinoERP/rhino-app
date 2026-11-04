import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/modules/whatsapp/server/commercial-tools", () => ({
  commercialToolNames: ["get_offer"],
  executeCommercialTool: execute,
}));
const id = "11111111-1111-4111-8111-111111111111";
const context = {
  organizationId: id,
  integrationId: id,
  conversationId: id,
  sourceMessageId: id,
};
const params = { params: Promise.resolve({ tool: "get_offer" }) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_AGENT_SERVICE_TOKEN", "private-service-token");
  execute.mockResolvedValue({ productName: "Queso" });
});
afterEach(() => vi.unstubAllEnvs());
function request(body: unknown, token?: string) {
  return new Request(
    "https://rhinos.example/api/internal/whatsapp-agent/tools/get_offer",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-whatsapp-agent-token": token } : {}),
      },
      body: JSON.stringify(body),
    }
  );
}
describe("worker tool authentication and fencing", () => {
  it("rejects a request without the service credential", async () => {
    expect((await POST(request({ context }), params)).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { jobId: id },
  ])("never accepts a worker request without a complete lease: %j", async (lease) => {
    expect(
      (
        await POST(
          request(
            { context: { ...context, ...lease } },
            "private-service-token"
          ),
          params
        )
      ).status
    ).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it("passes a complete lease and strips attempts to masquerade as sandbox", async () => {
    const response = await POST(
      request(
        {
          context: {
            ...context,
            jobId: id,
            leaseToken: id,
            mode: "LOCAL_SIMULATOR",
          },
          arguments: { product_id: id },
        },
        "private-service-token"
      ),
      params
    );
    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      { ...context, jobId: id, leaseToken: id },
      "get_offer",
      { product_id: id }
    );
  });
});
