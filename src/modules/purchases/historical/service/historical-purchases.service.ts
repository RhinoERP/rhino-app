import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  HistoricalPurchaseMetricInsert,
  HistoricalPurchaseRowData,
} from "../types";

/**
 * Convert month and year to ISO date string (first day of the month)
 */
function createPeriodDate(month: number, year: number): string {
  // Pad month with leading zero if needed
  const monthStr = month.toString().padStart(2, "0");
  return `${year}-${monthStr}-01`;
}

/**
 * Import historical purchase metrics for an organization
 */
export async function importHistoricalPurchasesForOrg(
  orgSlug: string,
  data: HistoricalPurchaseRowData[]
): Promise<{
  success: boolean;
  imported: number;
  updated: number;
  errors: string[];
}> {
  const supabase = await createClient();
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;

  // Get organization
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Usuario no autenticado");
  }

  // Process each row
  for (const [index, row] of data.entries()) {
    try {
      const period = createPeriodDate(row.mes, row.año);

      // Check if record already exists
      const { data: existing } = await supabase
        // @ts-expect-error - Table will exist after running migration
        .from("historical_purchase_metrics")
        .select("id")
        .eq("organization_id", org.id)
        .eq("period", period)
        .maybeSingle();

      const record: HistoricalPurchaseMetricInsert = {
        organization_id: org.id,
        period,
        total_amount: row.monto_total,
        total_orders: row.cantidad_ordenes,
        notes: row.notas || null,
        created_by: user.id,
      };

      // Upsert: insert or update if period already exists
      const { error } = await supabase
        // @ts-expect-error - Table will exist after running migration
        .from("historical_purchase_metrics")
        .upsert(record, {
          onConflict: "organization_id,period",
        });

      if (error) {
        errors.push(`Fila ${index + 2}: Error al guardar - ${error.message}`);
      } else if (existing) {
        updated += 1;
      } else {
        imported += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      errors.push(`Fila ${index + 2}: ${message}`);
    }
  }

  return {
    success: errors.length === 0,
    imported,
    updated,
    errors,
  };
}
