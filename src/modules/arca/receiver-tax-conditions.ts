import {
  type CustomerTaxCondition,
  getCustomerTaxConditionLabel,
  normalizeCustomerTaxCondition,
} from "@/modules/customers/tax-conditions";
import { ArcaValidationError } from "./errors";

const ARCA_RECEIVER_VAT_CONDITION_IDS: Record<CustomerTaxCondition, number> = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
  SUJETO_NO_CATEGORIZADO: 7,
  PROVEEDOR_DEL_EXTERIOR: 8,
  CLIENTE_DEL_EXTERIOR: 9,
  IVA_LIBERADO_LEY_19640: 10,
  MONOTRIBUTISTA_SOCIAL: 13,
  IVA_NO_ALCANZADO: 15,
  MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO: 16,
};

export function mapCustomerTaxConditionToArcaReceiverVatConditionId(
  value: string | null | undefined
): number {
  const normalized = normalizeCustomerTaxCondition(value);

  if (!normalized) {
    throw new ArcaValidationError(
      "La condición fiscal del cliente no tiene un mapeo válido para ARCA."
    );
  }

  const arcaId = ARCA_RECEIVER_VAT_CONDITION_IDS[normalized];

  if (!arcaId) {
    const label = getCustomerTaxConditionLabel(value) ?? value?.trim() ?? "";

    throw new ArcaValidationError(
      `La condición fiscal "${label}" todavía no está soportada para emitir en ARCA.`
    );
  }

  return arcaId;
}
