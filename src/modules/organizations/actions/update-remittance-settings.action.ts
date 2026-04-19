"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const remittanceSettingsSchema = z.object({
  autoEnabled: z.boolean(),
  prefix: z
    .string()
    .max(10, "El prefijo no puede tener más de 10 caracteres")
    .regex(/^[a-zA-Z0-9]*$/, "El prefijo solo puede contener letras y números"),
  startingNumber: z.number().int().min(0).optional(),
});

export type RemittanceSettingsInput = z.infer<typeof remittanceSettingsSchema>;

type ActionResult = {
  success: boolean;
  error?: string;
};

export async function updateRemittanceSettings(
  orgSlug: string,
  settings: RemittanceSettingsInput
): Promise<ActionResult> {
  try {
    const validated = remittanceSettingsSchema.parse(settings);

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "No autenticado" };
    }

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();

    if (orgError || !org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const updateData: Record<string, unknown> = {
      remittance_auto_enabled: validated.autoEnabled,
      remittance_prefix: validated.prefix,
    };

    if (validated.startingNumber !== undefined) {
      updateData.remittance_last_number = validated.startingNumber;
    }

    const { error: updateError } = await supabase
      .from("organizations")
      .update(updateData)
      .eq("id", org.id);

    if (updateError) {
      return { success: false, error: "Error al guardar la configuración" };
    }

    revalidatePath(`/org/${orgSlug}/configuracion`);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    return { success: false, error: "Error inesperado" };
  }
}
