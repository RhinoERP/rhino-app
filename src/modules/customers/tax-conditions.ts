export type CustomerTaxCondition =
  | "RESPONSABLE_INSCRIPTO"
  | "MONOTRIBUTO"
  | "EXENTO"
  | "CONSUMIDOR_FINAL"
  | "IVA_NO_ALCANZADO"
  | "MONOTRIBUTISTA_SOCIAL"
  | "SUJETO_NO_CATEGORIZADO"
  | "CLIENTE_DEL_EXTERIOR"
  | "PROVEEDOR_DEL_EXTERIOR"
  | "IVA_LIBERADO_LEY_19640"
  | "MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO";

export type CustomerTaxConditionOption = {
  value: CustomerTaxCondition;
  label: string;
};

export const CUSTOMER_TAX_CONDITION_OPTIONS: CustomerTaxConditionOption[] = [
  {
    value: "RESPONSABLE_INSCRIPTO",
    label: "Responsable inscripto",
  },
  {
    value: "MONOTRIBUTO",
    label: "Monotributo",
  },
  {
    value: "EXENTO",
    label: "Exento",
  },
  {
    value: "CONSUMIDOR_FINAL",
    label: "Consumidor final",
  },
  {
    value: "IVA_NO_ALCANZADO",
    label: "IVA no alcanzado",
  },
  {
    value: "MONOTRIBUTISTA_SOCIAL",
    label: "Monotributista social",
  },
  {
    value: "SUJETO_NO_CATEGORIZADO",
    label: "Sujeto no categorizado",
  },
  {
    value: "CLIENTE_DEL_EXTERIOR",
    label: "Cliente del exterior",
  },
  {
    value: "PROVEEDOR_DEL_EXTERIOR",
    label: "Proveedor del exterior",
  },
  {
    value: "IVA_LIBERADO_LEY_19640",
    label: "IVA liberado Ley 19.640",
  },
  {
    value: "MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO",
    label: "Monotributo trabajador independiente promovido",
  },
];

export const CUSTOMER_TAX_CONDITION_LABELS = Object.fromEntries(
  CUSTOMER_TAX_CONDITION_OPTIONS.map(
    (option) => [option.value, option.label] as const
  )
) as Record<CustomerTaxCondition, string>;

const CUSTOMER_TAX_CONDITION_ALIASES: Record<string, CustomerTaxCondition> = {
  RESPONSABLE_INSCRIPTO: "RESPONSABLE_INSCRIPTO",
  IVA_RESPONSABLE_INSCRIPTO: "RESPONSABLE_INSCRIPTO",
  MONOTRIBUTO: "MONOTRIBUTO",
  MONOTRIBUTISTA: "MONOTRIBUTO",
  RESPONSABLE_MONOTRIBUTO: "MONOTRIBUTO",
  EXENTO: "EXENTO",
  IVA_SUJETO_EXENTO: "EXENTO",
  CONSUMIDOR_FINAL: "CONSUMIDOR_FINAL",
  IVA_NO_ALCANZADO: "IVA_NO_ALCANZADO",
  MONOTRIBUTISTA_SOCIAL: "MONOTRIBUTISTA_SOCIAL",
  SUJETO_NO_CATEGORIZADO: "SUJETO_NO_CATEGORIZADO",
  CLIENTE_DEL_EXTERIOR: "CLIENTE_DEL_EXTERIOR",
  PROVEEDOR_DEL_EXTERIOR: "PROVEEDOR_DEL_EXTERIOR",
  IVA_LIBERADO_LEY_19640: "IVA_LIBERADO_LEY_19640",
  IVA_LIBERADO_LEY_N_19_640: "IVA_LIBERADO_LEY_19640",
  MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO:
    "MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO",
};

function normalizeTaxConditionKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeCustomerTaxCondition(
  value: string | null | undefined
): CustomerTaxCondition | null {
  if (!value?.trim()) {
    return null;
  }

  return (
    CUSTOMER_TAX_CONDITION_ALIASES[normalizeTaxConditionKey(value)] ?? null
  );
}

export function getCustomerTaxConditionLabel(
  value: string | null | undefined
): string | null {
  const normalized = normalizeCustomerTaxCondition(value);

  return normalized ? CUSTOMER_TAX_CONDITION_LABELS[normalized] : null;
}
