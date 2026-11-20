"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireCommercialAiAccess } from "../service/commercial-ai.service";
import { normalizePhone } from "../whatsapp/format";
import type { CommercialAiActionResult } from "./commercial-ai.actions";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
const DUPLICATE_CODE = "23505";

const schema = z.object({
  userId: z.string().uuid(),
  phone: z.string().max(40),
  dailyDigest: z.boolean(),
  teamView: z.boolean().default(false),
});

/**
 * El gerente carga el celular de cada vendedor. Con el celular vacío se borra:
 * ese número vuelve a tratarse como un cliente más en WhatsApp.
 */
export async function saveSellerPhoneAction(
  orgSlug: string,
  input: unknown
): Promise<CommercialAiActionResult> {
  try {
    const data = schema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const admin = createAdminClient();

    const { data: member } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", access.organizationId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!member) {
      throw new Error("Ese usuario no es de la empresa");
    }

    if (data.phone.trim() === "") {
      const { error } = await admin
        .from("commercial_ai_seller_phones")
        .delete()
        .eq("organization_id", access.organizationId)
        .eq("user_id", data.userId);
      check(error);
    } else {
      const phone = normalizePhone(data.phone);
      if (!phone) {
        throw new Error(
          "El celular no parece válido. Cargalo con característica, por ejemplo 11 2345 6789."
        );
      }
      const { error } = await admin.from("commercial_ai_seller_phones").upsert(
        {
          organization_id: access.organizationId,
          user_id: data.userId,
          phone,
          daily_digest: data.dailyDigest,
          team_view: data.teamView,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,user_id" }
      );
      check(error);
    }
    revalidatePath(`/org/${orgSlug}/ia-comercial`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo guardar",
    };
  }
}

function check(error: { code?: string; message: string } | null) {
  if (!error) {
    return;
  }
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
    throw new Error(
      "Falta aplicar la migración de WhatsApp de IA Comercial en la base de datos."
    );
  }
  if (error.code === DUPLICATE_CODE) {
    throw new Error("Ese celular ya está cargado para otro vendedor.");
  }
  throw new Error(error.message);
}
