export type ArcaTaxCode =
  | "IVA_27"
  | "IVA_21"
  | "IVA_10_5"
  | "IVA_5"
  | "IVA_2_5"
  | "IVA_0"
  | "TRIBUTO_01"
  | "TRIBUTO_02"
  | "TRIBUTO_03"
  | "TRIBUTO_04"
  | "TRIBUTO_99";

export type ArcaTaxCodeOption = {
  value: ArcaTaxCode;
  label: string;
  kind: "iva" | "tributo";
  arcaId: number;
  description: string;
};

export const ARCA_TAX_CODE_OPTIONS: ArcaTaxCodeOption[] = [
  {
    value: "IVA_27",
    label: "IVA 27%",
    kind: "iva",
    arcaId: 6,
    description:
      "Alícuota IVA definida por ARCA. La tasa debe coincidir con el 27%.",
  },
  {
    value: "IVA_21",
    label: "IVA 21%",
    kind: "iva",
    arcaId: 5,
    description:
      "Alícuota IVA definida por ARCA. La tasa debe coincidir con el 21%.",
  },
  {
    value: "IVA_10_5",
    label: "IVA 10,5%",
    kind: "iva",
    arcaId: 4,
    description:
      "Alícuota IVA definida por ARCA. La tasa debe coincidir con el 10,5%.",
  },
  {
    value: "IVA_5",
    label: "IVA 5%",
    kind: "iva",
    arcaId: 8,
    description:
      "Alícuota IVA definida por ARCA. La tasa debe coincidir con el 5%.",
  },
  {
    value: "IVA_2_5",
    label: "IVA 2,5%",
    kind: "iva",
    arcaId: 9,
    description:
      "Alícuota IVA definida por ARCA. La tasa debe coincidir con el 2,5%.",
  },
  {
    value: "IVA_0",
    label: "IVA 0%",
    kind: "iva",
    arcaId: 3,
    description:
      "Alícuota IVA 0% definida por ARCA para operaciones que requieren informar IVA en cero.",
  },
  {
    value: "TRIBUTO_01",
    label: "Impuestos nacionales",
    kind: "tributo",
    arcaId: 1,
    description:
      "Categoría ARCA para tributos nacionales, como percepciones de IVA o Ganancias. La tasa la define el régimen aplicable.",
  },
  {
    value: "TRIBUTO_02",
    label: "Impuestos provinciales / IIBB",
    kind: "tributo",
    arcaId: 2,
    description:
      "Categoría ARCA para tributos provinciales, como percepciones de Ingresos Brutos. La tasa depende de la jurisdicción y padrón.",
  },
  {
    value: "TRIBUTO_03",
    label: "Tributos municipales",
    kind: "tributo",
    arcaId: 3,
    description:
      "Categoría ARCA para tributos municipales. La tasa depende del municipio o régimen aplicable.",
  },
  {
    value: "TRIBUTO_04",
    label: "Impuestos internos",
    kind: "tributo",
    arcaId: 4,
    description:
      "Categoría ARCA para impuestos internos cuando correspondan al producto o actividad.",
  },
  {
    value: "TRIBUTO_99",
    label: "Otros tributos",
    kind: "tributo",
    arcaId: 99,
    description:
      "Categoría genérica de ARCA para otros tributos que no encajan en nacionales, provinciales, municipales o internos.",
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

export function getArcaTaxCodeDescription(
  value: string | null | undefined
): string | null {
  const normalized = normalizeArcaTaxCode(value);

  return normalized ? ARCA_TAX_CODE_METADATA[normalized].description : null;
}
