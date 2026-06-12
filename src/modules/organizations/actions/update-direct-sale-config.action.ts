"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateDirectSaleConfigByOrgSlug } from "@/modules/organizations/service/organizations.service";
import type { DirectSaleConfig } from "@/modules/organizations/types";

const updateDirectSaleConfigSchema = z.object({
  directSaleTaxId: z.string().uuid("Impuesto inválido").nullable(),
  directSaleTaxIds: z.array(z.string().uuid("Impuesto inválido")),
  directSaleMarkupPercentage: z
    .number()
    .min(0, "El recargo no puede ser negativo")
    .max(500, "El recargo no puede superar 500%"),
  salesEnabledPaymentMethods: z.array(
    z.enum([
      "efectivo",
      "tarjeta_de_credito",
      "tarjeta_de_debito",
      "transferencia",
      "qr",
      "cheque",
      "deposito",
      "e-cheq",
    ])
  ),
  salesDefaultPaymentMethod: z.enum([
    "efectivo",
    "tarjeta_de_credito",
    "tarjeta_de_debito",
    "transferencia",
    "qr",
    "cheque",
    "deposito",
    "e-cheq",
  ]),
  salesDefaultInvoiceType: z.enum(["NOTA_DE_VENTA", "FACTURA_B", "FACTURA_C"]),
  nonInvoicedPaymentMethods: z.array(
    z.enum([
      "efectivo",
      "tarjeta_de_credito",
      "tarjeta_de_debito",
      "transferencia",
      "qr",
      "cheque",
      "deposito",
      "e-cheq",
    ])
  ),
});

export type UpdateDirectSaleConfigActionInput = z.infer<
  typeof updateDirectSaleConfigSchema
>;

export type UpdateDirectSaleConfigActionResult = {
  success: boolean;
  data?: DirectSaleConfig;
  error?: string;
};

export async function updateDirectSaleConfigAction(
  orgSlug: string,
  input: UpdateDirectSaleConfigActionInput
): Promise<UpdateDirectSaleConfigActionResult> {
  try {
    const validatedInput = updateDirectSaleConfigSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "No autenticado",
      };
    }

    const data = await updateDirectSaleConfigByOrgSlug(orgSlug, validatedInput);

    revalidatePath(`/org/${orgSlug}/configuracion/venta-directa`);
    revalidatePath(`/org/${orgSlug}/venta-directa/nueva`);

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al actualizar la configuración",
    };
  }
}
