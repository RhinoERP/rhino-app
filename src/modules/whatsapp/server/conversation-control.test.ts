import { beforeEach, describe, expect, it, vi } from "vitest";
import { controlWhatsAppConversationAction } from "../actions/control-whatsapp-conversation.action";
import { reviewWhatsAppDeliveryAction } from "../actions/review-whatsapp-delivery.action";
import { sendWhatsAppManualMessageAction } from "../actions/send-whatsapp-manual-message.action";
import { setWhatsAppConversationAutomationAction } from "../actions/set-whatsapp-conversation-automation.action";
import { getWhatsAppUserAccess } from "./conversation-control";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  member: vi.fn(),
  permissions: vi.fn(),
  organization: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mocks.user },
    rpc: mocks.permissions,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.member,
      };
      return query;
    },
  }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.organization,
}));
vi.mock("./supabase-admin", () => ({
  createWhatsAppAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const privateFields = /private|secret|payload|lease/;
const privateErrors = /private|SQL|payload/;

const org = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const chat = "33333333-3333-4333-8333-333333333333";
const recipient = "44444444-4444-4444-8444-444444444444";
const input = {
  orgSlug: "rhino",
  conversationId: chat,
  expectedControlVersion: 0,
  operation: "CLAIM",
};
const control = {
  id: chat,
  status: "HANDOFF",
  assignedUserId: actor,
  humanClaimedAt: "2026-11-06T20:00:00Z",
  controlVersion: 1,
  deliveryBlock: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  mocks.member.mockResolvedValue({
    data: { is_active: true, is_owner: false },
    error: null,
  });
  mocks.permissions.mockResolvedValue({
    data: ["whatsapp.read", "whatsapp.manage"],
    error: null,
  });
  mocks.organization.mockResolvedValue({ id: org, is_active: true });
  mocks.rpc.mockResolvedValue({
    data: { success: true, control },
    error: null,
  });
});

describe("human conversation control boundary", () => {
  it("requires whatsapp.read for reads and keeps a reader in observation mode", async () => {
    mocks.permissions.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      getWhatsAppUserAccess("rhino", "whatsapp.read")
    ).rejects.toThrow("whatsapp.read");
    mocks.permissions.mockResolvedValueOnce({
      data: ["whatsapp.read"],
      error: null,
    });
    await expect(
      getWhatsAppUserAccess("rhino", "whatsapp.read")
    ).resolves.toMatchObject({ canManage: false });
  });
  it("derives actor and organization from the validated session, ignoring spoofed IDs", async () => {
    expect(
      await controlWhatsAppConversationAction({
        ...input,
        actorId: recipient,
        organizationId: recipient,
      })
    ).toMatchObject({ success: true, control });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "control_whatsapp_conversation",
      {
        p_organization_id: org,
        p_conversation_id: chat,
        p_actor_id: actor,
        p_expected_control_version: 0,
        p_operation: "CLAIM",
        p_assigned_user_id: null,
      }
    );
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/org/rhino/whatsapp/conversaciones"
    );
  });
  it.each([
    { expectedControlVersion: undefined },
    { expectedControlVersion: -1 },
    { expectedControlVersion: 0.5 },
    { conversationId: "not-an-id" },
    { operation: "TRANSFER" },
    { operation: "CLOSE" },
  ])("rejects invalid control requests before accessing the database: %j", async (change) => {
    expect(
      await controlWhatsAppConversationAction({ ...input, ...change })
    ).toMatchObject({ success: false });
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes explicit transfer recipient with the expected version", async () => {
    await controlWhatsAppConversationAction({
      ...input,
      expectedControlVersion: 4,
      operation: "TRANSFER",
      assignedUserId: recipient,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "control_whatsapp_conversation",
      expect.objectContaining({
        p_operation: "TRANSFER",
        p_assigned_user_id: recipient,
        p_expected_control_version: 4,
      })
    );
  });
  it.each([
    "reader",
    "inactive",
    "missing",
    "permission-error",
    "logged-out",
    "inactive-org",
  ])("denies %s before privileged control", async (kind) => {
    if (kind === "reader") {
      mocks.permissions.mockResolvedValue({
        data: ["whatsapp.read"],
        error: null,
      });
    }
    if (kind === "inactive") {
      mocks.member.mockResolvedValue({
        data: { is_active: false },
        error: null,
      });
    }
    if (kind === "missing") {
      mocks.member.mockResolvedValue({ data: null, error: null });
    }
    if (kind === "permission-error") {
      mocks.permissions.mockResolvedValue({
        data: null,
        error: { message: "private database error" },
      });
    }
    if (kind === "logged-out") {
      mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    }
    if (kind === "inactive-org") {
      mocks.organization.mockResolvedValue({ id: org, is_active: false });
    }
    const result = await controlWhatsAppConversationAction(input);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private database error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    "owner",
    "organization.admin",
  ])("preserves the ERP %s exception", async (kind) => {
    mocks.permissions.mockResolvedValue({
      data: kind === "organization.admin" ? [kind] : [],
      error: null,
    });
    mocks.member.mockResolvedValue({
      data: { is_active: true, is_owner: kind === "owner" },
      error: null,
    });
    expect(await controlWhatsAppConversationAction(input)).toMatchObject({
      success: true,
    });
  });
  it.each([
    "CONFLICT",
    "DELIVERY_UNRESOLVED",
  ])("returns safe current control on %s so the caller can refresh", async (code) => {
    mocks.rpc.mockResolvedValue({
      data: {
        success: false,
        code,
        control: {
          ...control,
          deliveryBlock: "UNKNOWN",
          payload: { secret: "hidden" },
        },
        internalPayload: "hidden",
      },
      error: null,
    });
    const result = await controlWhatsAppConversationAction(input);
    expect(result).toMatchObject({
      success: false,
      code,
      control: { controlVersion: 1, deliveryBlock: "UNKNOWN" },
    });
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(mocks.revalidate).toHaveBeenCalled();
  });
  it("does not expose provider/database diagnostics or unrecognized result shapes", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "private-token-and-query" },
    });
    const failed = await controlWhatsAppConversationAction(input);
    expect(failed.success).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("private-token");
    mocks.rpc.mockResolvedValueOnce({
      data: { secret: "private-token" },
      error: null,
    });
    expect(await controlWhatsAppConversationAction(input)).toMatchObject({
      success: false,
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("routes the existing automation action through the same versioned control", async () => {
    await setWhatsAppConversationAutomationAction({ ...input, enabled: true });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "control_whatsapp_conversation",
      expect.objectContaining({
        p_operation: "RESUME",
        p_actor_id: actor,
        p_expected_control_version: 0,
      })
    );
    mocks.rpc.mockClear();
    expect(
      await setWhatsAppConversationAutomationAction({
        orgSlug: "rhino",
        conversationId: chat,
        enabled: true,
      })
    ).toMatchObject({ success: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects a legacy human send without request identity or expected version", async () => {
    expect(
      await sendWhatsAppManualMessageAction({
        orgSlug: "rhino",
        conversationId: chat,
        text: "Hola",
      })
    ).toMatchObject({ success: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

const messageInput = {
  orgSlug: "rhino",
  conversationId: chat,
  expectedControlVersion: 1,
  clientRequestId: "55555555-5555-4555-8555-555555555555",
  text: "Hola",
};
const command = {
  id: recipient,
  clientRequestId: messageInput.clientRequestId,
  status: "PENDING",
  reasonCode: null,
  messageId: null,
  createdAt: "2026-11-06T20:00:00Z",
  updatedAt: "2026-11-06T20:00:00Z",
};
function commandRpc() {
  mocks.rpc.mockImplementation((name) =>
    Promise.resolve({
      data:
        name === "whatsapp_human_outbox_protocol_version"
          ? 1
          : {
              success: true,
              replayed: false,
              command: {
                ...command,
                lease_token: "private",
                payload: { token: "secret" },
              },
            },
      error: null,
    })
  );
}

describe("human command boundary", () => {
  it("persists with authenticated tenant/actor and returns only the public DTO", async () => {
    commandRpc();
    const result = await sendWhatsAppManualMessageAction({
      ...messageInput,
      actorId: recipient,
      organizationId: recipient,
      payload: "forged",
    });
    expect(result).toEqual({
      success: true,
      replayed: false,
      command,
      error: undefined,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("enqueue_whatsapp_human_message", {
      p_organization_id: org,
      p_actor_id: actor,
      p_conversation_id: chat,
      p_expected_control_version: 1,
      p_client_request_id: messageInput.clientRequestId,
      p_text: "Hola",
    });
    expect(JSON.stringify(result)).not.toMatch(privateFields);
  });
  it("does not accept a command without a session", async () => {
    commandRpc();
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    expect(await sendWhatsAppManualMessageAction(messageInput)).toMatchObject({
      success: false,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not accept commands from a read-only member", async () => {
    mocks.permissions.mockResolvedValue({
      data: ["whatsapp.read"],
      error: null,
    });
    expect(await sendWhatsAppManualMessageAction(messageInput)).toMatchObject({
      success: false,
      error: expect.stringContaining("whatsapp.manage"),
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed when the human protocol is not installed", async () => {
    expect(await sendWhatsAppManualMessageAction(messageInput)).toMatchObject({
      success: false,
      error: expect.stringContaining("migración"),
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    "WINDOW_EXPIRED",
    "CONTROL_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
    "DELIVERY_UNRESOLVED",
  ])("returns a safe recoverable conflict: %s", async (code) => {
    mocks.rpc.mockImplementation((name) =>
      Promise.resolve({
        data:
          name === "whatsapp_human_outbox_protocol_version"
            ? 1
            : { success: false, code, payload: "secret" },
        error: null,
      })
    );
    expect(await sendWhatsAppManualMessageAction(messageInput)).toMatchObject({
      success: false,
      code,
      error: expect.any(String),
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("sanitizes database errors", async () => {
    mocks.rpc.mockImplementation((name) =>
      Promise.resolve({
        data: name === "whatsapp_human_outbox_protocol_version" ? 1 : null,
        error:
          name === "whatsapp_human_outbox_protocol_version"
            ? null
            : { code: "P0001", message: "private SQL payload" },
      })
    );
    const result = await sendWhatsAppManualMessageAction(messageInput);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(privateErrors);
  });
  it("requires explicit review reason and known Meta ID for SENT", async () => {
    const result = await reviewWhatsAppDeliveryAction({
      ...messageInput,
      commandId: recipient,
      resolution: "SENT",
      reason: "Revisado en Meta",
    });
    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("delegates review to the same authenticated command service", async () => {
    commandRpc();
    expect(
      await reviewWhatsAppDeliveryAction({
        ...messageInput,
        commandId: recipient,
        resolution: "SENT",
        reason: "Revisado en Meta",
        externalMessageId: "wamid.known",
      })
    ).toMatchObject({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "resolve_whatsapp_unknown",
      expect.objectContaining({
        p_actor_id: actor,
        p_organization_id: org,
        p_resolution: "SENT",
        p_external_message_id: "wamid.known",
      })
    );
  });
});
