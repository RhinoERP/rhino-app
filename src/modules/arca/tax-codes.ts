// ─────────────────────────────────────────────────────────────────────────────
// ARCA/AFIP tax code catalogue
//
// IVA codes map to the WSFE `Iva.Id` field.
// Tributo codes map to the WSFE `Tributos.Id` field.
//
// IIBB provincial: ALL provinces use Id=2 (impuesto provincial).
// The province is identified by the tax name/Desc field, not by the Id.
// Users create a tax named "IIBB Santa Fe 3%" and assign code IIBB_PROVINCIAL.
//
// Retenciones: retenciones de 3rd-party are NOT included in the invoice body
// (they're separate certificates). However, IIBB perceived (percepción IIBB)
// IS included as a tributo with Id=2 ("Percepciones IIBB").
// ─────────────────────────────────────────────────────────────────────────────

export type ArcaTaxCode =
  // ── IVA ────────────────────────────────────────────────────────────────────
  | "IVA_27"
  | "IVA_21"
  | "IVA_10_5"
  | "IVA_5"
  | "IVA_2_5"
  | "IVA_0"
  // ── Tributos nacionales (Id=1) ─────────────────────────────────────────────
  | "TRIBUTO_NACIONAL"
  // ── IIBB Provincial / Percepciones IIBB (Id=2) ────────────────────────────
  | "IIBB_PROVINCIAL"
  // ── Tributos municipales (Id=3) ────────────────────────────────────────────
  | "TRIBUTO_MUNICIPAL"
  // ── Impuestos internos (Id=4) ──────────────────────────────────────────────
  | "TRIBUTO_INTERNO"
  // ── Impuesto de sellos (Id=5) ──────────────────────────────────────────────
  | "TRIBUTO_SELLOS"
  // ── Otros / genérico (Id=99) ──────────────────────────────────────────────
  | "TRIBUTO_99";

export type ArcaTaxCodeKind = "iva" | "tributo";

export type ArcaTaxCodeOption = {
  value: ArcaTaxCode;
  label: string;
  /** Short description shown in the UI */
  description: string;
  kind: ArcaTaxCodeKind;
  /** Numeric ID sent to AFIP WSFE in Iva.Id or Tributos.Id */
  arcaId: number;
};

export const ARCA_TAX_CODE_OPTIONS: ArcaTaxCodeOption[] = [
  // ── IVA ──────────────────────────────────────────────────────────────────
  {
    value: "IVA_27",
    label: "IVA 27%",
    description: "Alícuota diferencial — servicios de gas/electricidad",
    kind: "iva",
    arcaId: 6,
  },
  {
    value: "IVA_21",
    label: "IVA 21%",
    description: "Alícuota general",
    kind: "iva",
    arcaId: 5,
  },
  {
    value: "IVA_10_5",
    label: "IVA 10,5%",
    description: "Alícuota reducida",
    kind: "iva",
    arcaId: 4,
  },
  {
    value: "IVA_5",
    label: "IVA 5%",
    description: "Alícuota reducida especial",
    kind: "iva",
    arcaId: 8,
  },
  {
    value: "IVA_2_5",
    label: "IVA 2,5%",
    description: "Alícuota reducida especial",
    kind: "iva",
    arcaId: 9,
  },
  {
    value: "IVA_0",
    label: "IVA 0%",
    description: "Exento / gravado a tasa cero",
    kind: "iva",
    arcaId: 3,
  },
  // ── Tributos ─────────────────────────────────────────────────────────────
  {
    value: "TRIBUTO_NACIONAL",
    label: "Tributo nacional",
    description:
      "Impuestos nacionales (retenciones AFIP, etc.). AFIP Id=1. " +
      'El nombre del impuesto se envía como "Desc" a ARCA.',
    kind: "tributo",
    arcaId: 1,
  },
  {
    value: "IIBB_PROVINCIAL",
    label: "IIBB / Percepción provincial",
    description:
      "Ingresos Brutos o percepciones provinciales. AFIP Id=2. " +
      'Nombrá el impuesto con la provincia, ej: "IIBB Santa Fe 3%".',
    kind: "tributo",
    arcaId: 2,
  },
  {
    value: "TRIBUTO_MUNICIPAL",
    label: "Tributo municipal",
    description:
      'Tasas e impuestos municipales. AFIP Id=3. Nombrá la tasa, ej: "Tasa municipal CABA".',
    kind: "tributo",
    arcaId: 3,
  },
  {
    value: "TRIBUTO_INTERNO",
    label: "Impuesto interno",
    description: "Impuestos internos (tabaco, bebidas, etc.). AFIP Id=4.",
    kind: "tributo",
    arcaId: 4,
  },
  {
    value: "TRIBUTO_SELLOS",
    label: "Impuesto de sellos",
    description: "Sellos provinciales. AFIP Id=5.",
    kind: "tributo",
    arcaId: 5,
  },
  {
    value: "TRIBUTO_99",
    label: "Otro tributo",
    description:
      "Categoría genérica para tributos no clasificados. AFIP Id=99.",
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

/** Returns all codes of a given kind */
export function getArcaTaxCodesByKind(
  kind: ArcaTaxCodeKind
): ArcaTaxCodeOption[] {
  return ARCA_TAX_CODE_OPTIONS.filter((opt) => opt.kind === kind);
}

/**
 * Returns the AFIP `Tributos.Id` for a given code.
 * Throws if the code is an IVA code (wrong category).
 */
export function getArcaTributoId(code: ArcaTaxCode): number {
  const meta = ARCA_TAX_CODE_METADATA[code];
  if (meta.kind !== "tributo") {
    throw new Error(
      `El código fiscal ${code} es de IVA, no de tributo. Revisá la clasificación del impuesto.`
    );
  }
  return meta.arcaId;
}
