import {
  ARCA_TAX_CODE_METADATA,
  normalizeArcaTaxCode,
} from "@/modules/arca/tax-codes";
import type { ItemizedTaxPlan } from "@/modules/taxes/item-tax-calculations";
import { sumMeliMoney } from "./money";

export function assertMeliFiscalTaxPlan(
  invoiceType: string,
  plan: ItemizedTaxPlan,
  total: number
): void {
  if (invoiceType === "FACTURA_C") {
    if (plan.itemTaxes.length > 0) {
      throw new Error(
        "Factura C no admite impuestos IVA/tributos asociados. Revisá la configuración de impuestos."
      );
    }
    return;
  }
  const vatBases: number[] = [];
  let hasVat = false;
  for (const tax of plan.aggregateTaxes) {
    const code = normalizeArcaTaxCode(tax.taxCodeSnapshot);
    if (!code) {
      throw new Error("Un impuesto no tiene un código fiscal ARCA válido.");
    }
    if (ARCA_TAX_CODE_METADATA[code].kind === "iva") {
      const expectedRate = Number(code.slice(4).replace("_", "."));
      if (tax.rate !== expectedRate) {
        throw new Error(
          "La alícuota IVA no coincide con su código fiscal ARCA."
        );
      }
      hasVat = true;
      vatBases.push(tax.baseAmount);
    }
  }
  if (
    !hasVat ||
    Math.abs(sumMeliMoney([...vatBases, plan.totalTaxAmount]) - total) > 0.01
  ) {
    throw new Error(
      "Configurá IVA por producto o seleccioná un impuesto de respaldo que cubra todas las líneas de la venta."
    );
  }
}
