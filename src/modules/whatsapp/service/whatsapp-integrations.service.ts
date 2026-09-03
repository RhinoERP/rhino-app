import { createAdminClient } from "@/lib/supabase/admin-client";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";
import type { WhatsAppIntegrationConfigurationInput } from "../schemas";
import type { WhatsAppIntegration } from "../types";

type WhatsAppIntegrationRow = {
  id: string;
  organization_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  status: WhatsAppIntegration["status"];
  sales_price_list_id: string | null;
  responsible_user_id: string | null;
  business_hours: Record<string, unknown> | null;
  commercial_rules: Record<string, unknown> | null;
  handoff_message: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppConfigurationOption = Pick<SalesPriceList, "id" | "name">;

export type WhatsAppResponsibleUserOption = {
  id: string;
  label: string;
};

function mapIntegration(row: WhatsAppIntegrationRow): WhatsAppIntegration {
  return {
    id: row.id,
    organizationId: row.organization_id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number,
    status: row.status,
    salesPriceListId: row.sales_price_list_id,
    responsibleUserId: row.responsible_user_id,
    businessHours: row.business_hours ?? {},
    commercialRules: row.commercial_rules ?? {},
    handoffMessage: row.handoff_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getOrganizationId(orgSlug: string): Promise<string> {
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    throw new Error("Organización no encontrada");
  }

  return organization.id;
}

export async function getWhatsAppIntegrationByOrgSlug(
  orgSlug: string
): Promise<WhatsAppIntegration | null> {
  const organizationId = await getOrganizationId(orgSlug);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("whatsapp_integrations")
    .select(
      "id, organization_id, phone_number_id, display_phone_number, status, sales_price_list_id, responsible_user_id, business_hours, commercial_rules, handoff_message, created_at, updated_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo obtener la integración de WhatsApp: ${error.message}`
    );
  }

  return data ? mapIntegration(data as WhatsAppIntegrationRow) : null;
}

export async function getWhatsAppConfigurationOptions(
  orgSlug: string
): Promise<{
  priceLists: WhatsAppConfigurationOption[];
  responsibleUsers: WhatsAppResponsibleUserOption[];
}> {
  const organizationId = await getOrganizationId(orgSlug);
  const supabase = createAdminClient();

  const [priceListsResult, membersResult] = await Promise.all([
    supabase
      .from("sales_price_lists")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);

  if (priceListsResult.error) {
    throw new Error(
      `No se pudieron obtener las listas de precios: ${priceListsResult.error.message}`
    );
  }

  if (membersResult.error) {
    throw new Error(
      `No se pudieron obtener los vendedores: ${membersResult.error.message}`
    );
  }

  const userIds = (membersResult.data ?? []).map((member) => member.user_id);
  const users = await Promise.all(
    userIds.map(async (userId) => {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error || !data.user) {
        return null;
      }

      return {
        id: data.user.id,
        label:
          (data.user.user_metadata?.full_name as string | undefined) ??
          data.user.email ??
          data.user.id,
      };
    })
  );

  return {
    priceLists: (priceListsResult.data ?? []) as WhatsAppConfigurationOption[],
    responsibleUsers: users.filter(
      (user): user is WhatsAppResponsibleUserOption => user !== null
    ),
  };
}

export async function saveWhatsAppIntegrationByOrgSlug(
  orgSlug: string,
  input: WhatsAppIntegrationConfigurationInput,
  actorId: string
): Promise<WhatsAppIntegration> {
  const organizationId = await getOrganizationId(orgSlug);
  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("whatsapp_integrations")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `No se pudo preparar la integración de WhatsApp: ${existingError.message}`
    );
  }

  const values = {
    phone_number_id: input.phoneNumberId,
    display_phone_number: input.displayPhoneNumber || null,
    status: input.status,
    sales_price_list_id: input.salesPriceListId,
    responsible_user_id: input.responsibleUserId,
    business_hours: input.businessHours,
    commercial_rules: input.commercialRules,
    handoff_message: input.handoffMessage || null,
  };

  const query = existing
    ? supabase
        .from("whatsapp_integrations")
        .update(values)
        .eq("id", existing.id)
        .eq("organization_id", organizationId)
    : supabase.from("whatsapp_integrations").insert({
        ...values,
        organization_id: organizationId,
        created_by: actorId,
      });

  const { data, error } = await query
    .select(
      "id, organization_id, phone_number_id, display_phone_number, status, sales_price_list_id, responsible_user_id, business_hours, commercial_rules, handoff_message, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo guardar la integración de WhatsApp: ${error?.message ?? "sin datos"}`
    );
  }

  return mapIntegration(data as WhatsAppIntegrationRow);
}
