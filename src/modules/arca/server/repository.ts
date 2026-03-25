import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { ArcaClientActor, OrganizationArcaSettingsRow } from "../types";

type OrganizationArcaSettingsInsert =
  Database["public"]["Tables"]["organization_arca_settings"]["Insert"];
type OrganizationArcaSettingsUpdate =
  Database["public"]["Tables"]["organization_arca_settings"]["Update"];

function getRepositoryClient(
  actor: ArcaClientActor
): Promise<SupabaseClient<Database>> {
  if (actor === "system") {
    return Promise.resolve(createAdminClient() as SupabaseClient<Database>);
  }

  return createClient();
}

export async function getOrganizationArcaSettingsByOrganizationId(
  organizationId: string,
  actor: ArcaClientActor = "current-user"
): Promise<OrganizationArcaSettingsRow | null> {
  const supabase = await getRepositoryClient(actor);
  const { data, error } = await supabase
    .from("organization_arca_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo obtener la configuración ARCA: ${error.message}`
    );
  }

  return data;
}

export async function upsertOrganizationArcaSettings(
  payload: OrganizationArcaSettingsInsert,
  actor: ArcaClientActor = "current-user"
): Promise<OrganizationArcaSettingsRow> {
  const supabase = await getRepositoryClient(actor);
  const { data, error } = await supabase
    .from("organization_arca_settings")
    .upsert(payload, {
      onConflict: "organization_id",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo guardar la configuración ARCA: ${error?.message ?? "sin respuesta"}`
    );
  }

  return data;
}

export async function updateOrganizationArcaSettings(
  organizationId: string,
  payload: OrganizationArcaSettingsUpdate,
  actor: ArcaClientActor = "current-user"
): Promise<OrganizationArcaSettingsRow> {
  const supabase = await getRepositoryClient(actor);
  const { data, error } = await supabase
    .from("organization_arca_settings")
    .update(payload)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo actualizar la configuración ARCA: ${error?.message ?? "sin respuesta"}`
    );
  }

  return data;
}
