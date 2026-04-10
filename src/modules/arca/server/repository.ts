import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type {
  ArcaClientActor,
  ArcaEnvironment,
  ArcaOperatorProfileRow,
  OrganizationArcaSettingsRow,
} from "../types";

type OrganizationArcaSettingsInsert =
  Database["public"]["Tables"]["organization_arca_settings"]["Insert"];
type OrganizationArcaSettingsUpdate =
  Database["public"]["Tables"]["organization_arca_settings"]["Update"];
type ArcaOperatorProfileInsert =
  Database["public"]["Tables"]["arca_operator_profiles"]["Insert"];
type ArcaOperatorProfileUpdate =
  Database["public"]["Tables"]["arca_operator_profiles"]["Update"];

function getRepositoryClient(
  actor: ArcaClientActor
): Promise<SupabaseClient<Database>> {
  if (actor === "system") {
    return Promise.resolve(createAdminClient() as SupabaseClient<Database>);
  }

  return createClient();
}

function getAdminRepositoryClient(): SupabaseClient<Database> {
  return createAdminClient() as SupabaseClient<Database>;
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

export async function getArcaOperatorProfileByEnvironment(
  environment: ArcaEnvironment
): Promise<ArcaOperatorProfileRow | null> {
  const supabase = getAdminRepositoryClient();
  const { data, error } = await supabase
    .from("arca_operator_profiles")
    .select("*")
    .eq("environment", environment)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo obtener el perfil operador ARCA: ${error.message}`
    );
  }

  return data;
}

export async function getArcaOperatorProfileById(
  id: string
): Promise<ArcaOperatorProfileRow | null> {
  const supabase = getAdminRepositoryClient();
  const { data, error } = await supabase
    .from("arca_operator_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo obtener el perfil operador ARCA por id: ${error.message}`
    );
  }

  return data;
}

export async function upsertArcaOperatorProfile(
  payload: ArcaOperatorProfileInsert
): Promise<ArcaOperatorProfileRow> {
  const supabase = getAdminRepositoryClient();
  const { data, error } = await supabase
    .from("arca_operator_profiles")
    .upsert(payload, {
      onConflict: "environment",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo guardar el perfil operador ARCA: ${error?.message ?? "sin respuesta"}`
    );
  }

  return data;
}

export async function updateArcaOperatorProfile(
  id: string,
  payload: ArcaOperatorProfileUpdate
): Promise<ArcaOperatorProfileRow> {
  const supabase = getAdminRepositoryClient();
  const { data, error } = await supabase
    .from("arca_operator_profiles")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo actualizar el perfil operador ARCA: ${error?.message ?? "sin respuesta"}`
    );
  }

  return data;
}
