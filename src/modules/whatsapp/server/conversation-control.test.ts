import { beforeEach, describe, expect, it, vi } from "vitest";
import { controlWhatsAppConversationAction } from "../actions/control-whatsapp-conversation.action";
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
  it("keeps the legacy direct human send disabled until durable sending is implemented", async () => {
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
