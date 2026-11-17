"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildCustomerInsert } from "@/modules/customers/service/customers.service";
import { getWhatsAppUserAccess } from "../server/conversation-control";
import { createWhatsAppAdminClient } from "../server/supabase-admin";

const customerInput = z.object({
  business_name: z.string().trim().min(1),
  fantasy_name: z.string().optional(),
  cuit: z.string().optional(),
  email: z.email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  delivery_address: z.string().nullish(),
  delivery_city: z.string().nullish(),
  tax_condition: z.string().optional(),
  client_number: z.string().optional(),
  sales_price_list_id: z.uuid("Seleccioná una lista de venta"),
  customer_channel: z.enum(["DISTRIBUIDORA", "POS", "MIXTO"]),
  assigned_seller_id: z.union([z.uuid(), z.literal("")]).optional(),
  preferred_carrier_id: z.union([z.uuid(), z.literal("")]).optional(),
  due_days: z.number().int().min(1).nullish(),
});

const candidateSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    samePhone: z.boolean(),
  })
);

const permissions = ["whatsapp.read", "whatsapp.manage", "customers.manage"];

export async function searchWhatsAppCustomerLinks(
  orgSlug: string,
  conversationId: string,
  query: string
) {
  const access = await getWhatsAppUserAccess(orgSlug, permissions);
  const { data, error } = await createWhatsAppAdminClient().rpc(
    "search_whatsapp_customer_links",
    {
      p_org: access.organization.id,
      p_actor: access.userId,
      p_chat: z.uuid().parse(conversationId),
      p_query: z.string().trim().max(100).parse(query),
    }
  );
  if (error) {
    throw new Error("No se pudieron buscar fichas para esta conversación");
  }
  return candidateSchema.parse(data);
}

export async function linkWhatsAppCustomerAction(
  orgSlug: string,
  conversationId: string,
  input: { customerId: string } | { create: unknown }
) {
  try {
    const access = await getWhatsAppUserAccess(orgSlug, permissions);
    const { data, error } = await createWhatsAppAdminClient().rpc(
      "link_whatsapp_customer",
      {
        p_org: access.organization.id,
        p_actor: access.userId,
        p_chat: z.uuid().parse(conversationId),
        p_customer:
          "customerId" in input ? z.uuid().parse(input.customerId) : null,
        p_new_customer:
          "create" in input
            ? buildCustomerInsert(customerInput.parse(input.create))
            : null,
      }
    );
    if (error || !data) {
      throw new Error(
        error?.code === "P0001"
          ? error.message
          : "No se pudo vincular el cliente a esta conversación"
      );
    }
    revalidatePath(`/org/${orgSlug}/clientes`);
    revalidatePath(`/org/${orgSlug}/whatsapp/conversaciones`);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error:
          "Completá los datos del cliente y seleccioná una lista de venta.",
      };
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo vincular el cliente",
    };
  }
}
