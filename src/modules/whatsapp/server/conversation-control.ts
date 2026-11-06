import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createWhatsAppAdminClient } from "./supabase-admin";

export const conversationControlInputSchema = z
  .object({
    orgSlug: z.string().trim().min(1),
    conversationId: z.string().uuid(),
    expectedControlVersion: z.number().int().nonnegative(),
    operation: z.enum(["CLAIM", "TRANSFER", "PAUSE", "RESUME"]),
    assignedUserId: z.string().uuid().optional(),
  })
  .refine(
    (input) => input.operation !== "TRANSFER" || Boolean(input.assignedUserId)
  );

const controlSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["ACTIVE", "HANDOFF", "PAUSED", "CLOSED"]),
  assignedUserId: z.string().uuid().nullable(),
  humanClaimedAt: z.string().nullable(),
  controlVersion: z.number().int().nonnegative(),
  deliveryBlock: z.enum(["SENDING", "UNKNOWN"]).nullable(),
});
const resultSchema = z.object({
  success: z.boolean(),
  code: z.enum(["CONFLICT", "DELIVERY_UNRESOLVED"]).optional(),
  control: controlSchema,
});

export type WhatsAppConversationControl = z.infer<typeof controlSchema>;
export type WhatsAppControlResult = {
  success: boolean;
  code?: "CONFLICT" | "DELIVERY_UNRESOLVED";
  control?: WhatsAppConversationControl;
  error?: string;
};

export class WhatsAppControlAccessError extends Error {}

const operatorsSchema = z.array(
  z.object({ id: z.string().uuid(), name: z.string() })
);
export type WhatsAppControlOperator = z.infer<typeof operatorsSchema>[number];

export async function getWhatsAppControlOperators(
  organizationId: string
): Promise<WhatsAppControlOperator[]> {
  const { data, error } = await createWhatsAppAdminClient().rpc(
    "list_whatsapp_control_operators",
    {
      p_organization_id: organizationId,
    }
  );
  const operators = operatorsSchema.safeParse(data);
  if (error || !operators.success) {
    throw new Error("No se pudieron cargar los responsables de WhatsApp");
  }
  return operators.data;
}

export async function getWhatsAppUserAccess(
  orgSlug: string,
  permission: "whatsapp.read" | "whatsapp.manage"
) {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new WhatsAppControlAccessError(
      "Iniciá sesión para acceder a WhatsApp"
    );
  }
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization?.is_active) {
    throw new WhatsAppControlAccessError("La organización no está disponible");
  }
  const [member, permissions] = await Promise.all([
    client
      .from("organization_members")
      .select("is_active, is_owner")
      .eq("organization_id", organization.id)
      .eq("user_id", data.user.id)
      .maybeSingle(),
    client.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);
  if (member.error || permissions.error || !member.data?.is_active) {
    throw new WhatsAppControlAccessError(
      "No tenés acceso activo a esta organización"
    );
  }
  const keys = (permissions.data ?? []) as string[];
  const admin = member.data.is_owner || keys.includes("organization.admin");
  if (!(admin || keys.includes(permission))) {
    throw new WhatsAppControlAccessError(`Necesitás el permiso ${permission}`);
  }
  return {
    organization,
    userId: data.user.id,
    canManage: admin || keys.includes("whatsapp.manage"),
  };
}

export async function controlWhatsAppConversation(
  input: z.infer<typeof conversationControlInputSchema>
): Promise<WhatsAppControlResult> {
  const { organization, userId } = await getWhatsAppUserAccess(
    input.orgSlug,
    "whatsapp.manage"
  );
  // SQL rechecks permission, module flag and version under the conversation lock.
  // The browser supplies neither tenant nor actor.
  const { data, error } = await createWhatsAppAdminClient().rpc(
    "control_whatsapp_conversation",
    {
      p_organization_id: organization.id,
      p_conversation_id: input.conversationId,
      p_actor_id: userId,
      p_expected_control_version: input.expectedControlVersion,
      p_operation: input.operation,
      p_assigned_user_id: input.assignedUserId ?? null,
    }
  );
  if (error) {
    return {
      success: false,
      error:
        error.code === "42501"
          ? "La conversación no está disponible o el módulo está deshabilitado"
          : "No se pudo cambiar el control. Verificá el estado y que el destinatario tenga whatsapp.manage.",
    };
  }
  const result = resultSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: "No se pudo confirmar el control de la conversación",
    };
  }
  const errors = {
    CONFLICT:
      "El control cambió. Revisá el responsable actual y volvé a intentar.",
    DELIVERY_UNRESOLVED:
      "Hay un envío en curso o sin confirmar. Resolvelo antes de devolver a la IA.",
  };
  return {
    ...result.data,
    error: result.data.code ? errors[result.data.code] : undefined,
  };
}
