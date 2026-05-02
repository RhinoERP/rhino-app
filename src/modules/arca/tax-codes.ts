export type ArcaTaxCode =
  | "IVA_27"
  | "IVA_21"
  | "IVA_10_5"
  | "IVA_5"
  | "IVA_2_5"
  | "IVA_0"
  | "TRIBUTO_99";

export type ArcaTaxCodeOption = {
  value: ArcaTaxCode;
  label: string;
  kind: "iva" | "tributo";
  arcaId: number;
};

export const ARCA_TAX_CODE_OPTIONS: ArcaTaxCodeOption[] = [
  {
    value: "IVA_27",
    label: "IVA 27%",
    kind: "iva",
    arcaId: 6,
  },
  {
    value: "IVA_21",
    label: "IVA 21%",
    kind: "iva",
    arcaId: 5,
  },
  {
    value: "IVA_10_5",
    label: "IVA 10,5%",
    kind: "iva",
    arcaId: 4,
  },
  {
    value: "IVA_5",
    label: "IVA 5%",
    kind: "iva",
    arcaId: 8,
  },
  {
    value: "IVA_2_5",
    label: "IVA 2,5%",
    kind: "iva",
    arcaId: 9,
  },
  {
    value: "IVA_0",
    label: "IVA 0%",
    kind: "iva",
    arcaId: 3,
  },
  {
    value: "TRIBUTO_99",
    label: "Tributo genérico ARCA",
    kind: "tributo",
    arcaId: 99,
  },
];

export const ARCA_TAX_CODE_METADATA = Object.fromEntries(
  ARCA_TAX_CODE_OPTIONS.map((option) => [option.value, option] as const)
) as Record<ArcaTaxCode, ArcaTaxCodeOption>;

export function isArcaTaxCode(value: string): value is ArcaTaxCode {
  return value in ARCA_TAX_CODE_METADATA;
}

export function normalizeArcaTaxCode(
  value: string | null | undefined
): ArcaTaxCode | null {
  const normalized = value?.trim().toUpperCase();

  if (!(normalized && isArcaTaxCode(normalized))) {
    return null;
  }

  return normalized;
}

export function getArcaTaxCodeLabel(
  value: string | null | undefined
): string | null {
  const normalized = normalizeArcaTaxCode(value);

  return normalized ? ARCA_TAX_CODE_METADATA[normalized].label : null;
}
