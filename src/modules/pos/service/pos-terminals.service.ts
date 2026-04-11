import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  type CreatePosTerminalInput,
  createPosTerminalSchema,
  type PosTerminal,
} from "../types";

function sanitizeText(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function getPosTerminalsByOrgSlug(
  orgSlug: string
): Promise<PosTerminal[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pos_terminals")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron obtener terminales POS: ${error.message}`);
  }

  return data ?? [];
}

export async function createPosTerminalForOrg(
  input: CreatePosTerminalInput
): Promise<PosTerminal> {
  const parsed = createPosTerminalSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Datos inválidos para crear la terminal POS."
    );
  }

  const payload = parsed.data;

  const org = await getOrganizationBySlug(payload.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: activeTerminal, error: activeTerminalError } = await supabase
    .from("pos_terminals")
    .select("id")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (activeTerminalError) {
    throw new Error(
      `No se pudo validar terminal activa existente: ${activeTerminalError.message}`
    );
  }

  const shouldBeActive = payload.isActive || !activeTerminal?.id;

  const { data: terminal, error: terminalError } = await supabase
    .from("pos_terminals")
    .insert({
      organization_id: org.id,
      name: payload.name.trim(),
      code: sanitizeText(payload.code),
      cash_register_number: payload.cashRegisterNumber,
      is_active: shouldBeActive,
      default_price_list_id: payload.defaultPriceListId ?? null,
    })
    .select("*")
    .maybeSingle();

  if (terminalError) {
    throw new Error(
      `No se pudo crear la terminal POS: ${terminalError.message}`
    );
  }

  if (!terminal) {
    throw new Error("No se pudo crear la terminal POS");
  }

  return terminal;
}
