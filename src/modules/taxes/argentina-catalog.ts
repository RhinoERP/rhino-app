/**
 * Catálogo de Impuestos Argentinos
 *
 * Incluye: IVA, IIBB por provincia, Percepciones IIBB, Retenciones IIBB,
 * Retenciones nacionales (AFIP), Impuesto de Sellos.
 *
 * ⚠️  Las alícuotas son orientativas (2025). Verificá con tu contador
 *     y/o el código fiscal de cada provincia antes de usar en producción.
 *
 * Códigos AFIP:
 *   IVA            → kind: "iva",     arcaCode: "IVA_xx"
 *   IIBB/Percep.   → kind: "tributo", arcaCode: "IIBB_PROVINCIAL"  (Id=2)
 *   Nacionales     → kind: "tributo", arcaCode: "TRIBUTO_NACIONAL"  (Id=1)
 *   Sellos         → kind: "tributo", arcaCode: "TRIBUTO_SELLOS"    (Id=5)
 *   Municipales    → kind: "tributo", arcaCode: "TRIBUTO_MUNICIPAL" (Id=3)
 */

export type TaxCatalogCategory =
  | "iva"
  | "iibb"
  | "percepcion_iibb"
  | "retencion_iibb"
  | "retencion_nacional"
  | "sellos"
  | "municipal";

export type CatalogTax = {
  /** Unique key — used to prevent duplicate imports */
  key: string;
  name: string;
  /** Percentage rate (e.g. 21 for 21%) */
  rate: number;
  /** ARCA tax code from tax-codes.ts */
  arcaCode: string;
  category: TaxCatalogCategory;
  /** Province name (null for national taxes) */
  province: string | null;
  description: string;
};

export const CATALOG_CATEGORY_LABELS: Record<TaxCatalogCategory, string> = {
  iva: "IVA",
  iibb: "Ingresos Brutos (IIBB)",
  percepcion_iibb: "Percepciones IIBB",
  retencion_iibb: "Retenciones IIBB",
  retencion_nacional: "Retenciones Nacionales (AFIP)",
  sellos: "Impuesto de Sellos",
  municipal: "Tasas Municipales",
};

// ─────────────────────────────────────────────────────────────────────────────
// IVA
// ─────────────────────────────────────────────────────────────────────────────

const IVA_TAXES: CatalogTax[] = [
  {
    key: "IVA_27",
    name: "IVA 27%",
    rate: 27,
    arcaCode: "IVA_27",
    category: "iva",
    province: null,
    description: "Alícuota diferencial — servicios de gas, agua, telefonía.",
  },
  {
    key: "IVA_21",
    name: "IVA 21%",
    rate: 21,
    arcaCode: "IVA_21",
    category: "iva",
    province: null,
    description: "Alícuota general vigente.",
  },
  {
    key: "IVA_10_5",
    name: "IVA 10,5%",
    rate: 10.5,
    arcaCode: "IVA_10_5",
    category: "iva",
    province: null,
    description:
      "Alícuota reducida — medicina prepaga, animales vivos, vegetales, etc.",
  },
  {
    key: "IVA_0",
    name: "IVA 0% (Exento)",
    rate: 0,
    arcaCode: "IVA_0",
    category: "iva",
    province: null,
    description:
      "Operaciones exentas de IVA (productos básicos de la canasta, libros, etc.).",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// IIBB por Provincia
// Fuente: alícuotas generales 2025. Verificar con cada jurisdicción.
// ─────────────────────────────────────────────────────────────────────────────

const IIBB_RATES: Array<{ province: string; rate: number; note?: string }> = [
  {
    province: "Buenos Aires (ARBA)",
    rate: 3.5,
    note: "Actividades comerciales generales. Verificar por NAIIB-18.",
  },
  {
    province: "CABA",
    rate: 3,
    note: "Actividades comerciales. Código 8099 del CM.",
  },
  {
    province: "Córdoba",
    rate: 4,
    note: "Alícuota general. Verificar según actividad.",
  },
  { province: "Santa Fe", rate: 3.5, note: "Alícuota general comercio." },
  { province: "Mendoza", rate: 3.5, note: "Actividades comerciales." },
  { province: "Tucumán", rate: 3.5, note: "Alícuota general." },
  { province: "Entre Ríos", rate: 3.5, note: "Comercio en general." },
  { province: "Salta", rate: 3.5, note: "Actividades comerciales." },
  { province: "Misiones", rate: 4, note: "Actividades comerciales." },
  { province: "Chaco", rate: 3.5, note: "Actividades comerciales." },
  { province: "Corrientes", rate: 3.5, note: "Alícuota general." },
  {
    province: "Santiago del Estero",
    rate: 3.5,
    note: "Actividades comerciales.",
  },
  { province: "Jujuy", rate: 3.5, note: "Actividades comerciales." },
  { province: "Río Negro", rate: 3.5, note: "Actividades comerciales." },
  { province: "Neuquén", rate: 3.5, note: "Actividades comerciales." },
  { province: "Formosa", rate: 3.5, note: "Actividades comerciales." },
  { province: "Chubut", rate: 3, note: "Actividades comerciales." },
  { province: "San Juan", rate: 3.5, note: "Alícuota general." },
  { province: "San Luis", rate: 3, note: "Actividades comerciales." },
  { province: "Santa Cruz", rate: 3.5, note: "Actividades comerciales." },
  { province: "La Pampa", rate: 3, note: "Actividades comerciales." },
  { province: "Catamarca", rate: 3.5, note: "Actividades comerciales." },
  { province: "La Rioja", rate: 3.5, note: "Actividades comerciales." },
  { province: "Tierra del Fuego", rate: 3, note: "Actividades comerciales." },
];

const IIBB_TAXES: CatalogTax[] = IIBB_RATES.map(({ province, rate, note }) => ({
  key: `IIBB_${province.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
  name: `IIBB ${province}`,
  rate,
  arcaCode: "IIBB_PROVINCIAL",
  category: "iibb" as TaxCatalogCategory,
  province,
  description: `Ingresos Brutos ${province}. ${note ?? ""} Alícuota orientativa — verificar.`,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Percepciones IIBB
// Aplican cuando el vendedor actúa como agente de percepción.
// Alícuotas menores a las de IIBB (generalmente 50-80% del IIBB).
// ─────────────────────────────────────────────────────────────────────────────

const PERCEP_RATES: Array<{ province: string; rate: number }> = [
  { province: "Buenos Aires (ARBA)", rate: 3 },
  { province: "CABA", rate: 2.5 },
  { province: "Córdoba", rate: 3 },
  { province: "Santa Fe", rate: 3 },
  { province: "Mendoza", rate: 3 },
  { province: "Tucumán", rate: 3 },
  { province: "Entre Ríos", rate: 3 },
  { province: "Salta", rate: 3 },
  { province: "Misiones", rate: 3.5 },
  { province: "Chaco", rate: 3 },
  { province: "Corrientes", rate: 3 },
  { province: "Santiago del Estero", rate: 3 },
  { province: "Jujuy", rate: 3 },
  { province: "Río Negro", rate: 3 },
  { province: "Neuquén", rate: 3 },
  { province: "Formosa", rate: 3 },
  { province: "Chubut", rate: 2.5 },
  { province: "San Juan", rate: 3 },
  { province: "San Luis", rate: 2.5 },
  { province: "Santa Cruz", rate: 3 },
  { province: "La Pampa", rate: 2.5 },
  { province: "Catamarca", rate: 3 },
  { province: "La Rioja", rate: 3 },
  { province: "Tierra del Fuego", rate: 2.5 },
];

const PERCEPCION_TAXES: CatalogTax[] = PERCEP_RATES.map(
  ({ province, rate }) => ({
    key: `PERCEP_IIBB_${province.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
    name: `Percepción IIBB ${province}`,
    rate,
    arcaCode: "IIBB_PROVINCIAL",
    category: "percepcion_iibb" as TaxCatalogCategory,
    province,
    description: `Percepción de Ingresos Brutos ${province}. Aplicable cuando el emisor es agente de percepción. Alícuota orientativa.`,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Retenciones IIBB
// Aplican cuando el comprador es agente de retención registrado en el padrón.
// ─────────────────────────────────────────────────────────────────────────────

const RETEN_IIBB_RATES: Array<{ province: string; rate: number }> = [
  { province: "Buenos Aires (ARBA)", rate: 3 },
  { province: "CABA", rate: 2.5 },
  { province: "Córdoba", rate: 3 },
  { province: "Santa Fe", rate: 3 },
  { province: "Mendoza", rate: 3 },
  { province: "Tucumán", rate: 3 },
  { province: "Entre Ríos", rate: 3 },
  { province: "Salta", rate: 3 },
  { province: "Misiones", rate: 3.5 },
  { province: "Chaco", rate: 3 },
  { province: "Corrientes", rate: 3 },
  { province: "Santiago del Estero", rate: 3 },
  { province: "Jujuy", rate: 3 },
  { province: "Río Negro", rate: 3 },
  { province: "Neuquén", rate: 3 },
];

const RETENCION_IIBB_TAXES: CatalogTax[] = RETEN_IIBB_RATES.map(
  ({ province, rate }) => ({
    key: `RETEN_IIBB_${province.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
    name: `Retención IIBB ${province}`,
    rate,
    arcaCode: "IIBB_PROVINCIAL",
    category: "retencion_iibb" as TaxCatalogCategory,
    province,
    description: `Retención de Ingresos Brutos ${province}. La practica el comprador si está inscripto en el padrón de agentes. Alícuota orientativa.`,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Retenciones Nacionales (AFIP)
// ─────────────────────────────────────────────────────────────────────────────

const RETENCION_NACIONAL_TAXES: CatalogTax[] = [
  {
    key: "RETEN_GANANCIAS_6",
    name: "Retención Ganancias 6%",
    rate: 6,
    arcaCode: "TRIBUTO_NACIONAL",
    category: "retencion_nacional",
    province: null,
    description:
      "Retención del Impuesto a las Ganancias. RG AFIP 830. Alícuota para sujetos inscriptos. Verificar escala vigente.",
  },
  {
    key: "RETEN_GANANCIAS_28",
    name: "Retención Ganancias 28% (no inscripto)",
    rate: 28,
    arcaCode: "TRIBUTO_NACIONAL",
    category: "retencion_nacional",
    province: null,
    description:
      "Retención Ganancias para sujetos NO inscriptos en el impuesto. RG AFIP 830.",
  },
  {
    key: "RETEN_IVA_10_5",
    name: "Retención IVA 10,5%",
    rate: 10.5,
    arcaCode: "TRIBUTO_NACIONAL",
    category: "retencion_nacional",
    province: null,
    description:
      "Retención de IVA para inscriptos. RG AFIP 2854. Verificar alícuota vigente.",
  },
  {
    key: "RETEN_IVA_21",
    name: "Retención IVA 21%",
    rate: 21,
    arcaCode: "TRIBUTO_NACIONAL",
    category: "retencion_nacional",
    province: null,
    description: "Retención de IVA para sujetos no inscriptos o sin CUIT.",
  },
  {
    key: "PERCEP_IVA_5_25",
    name: "Percepción IVA 5,25%",
    rate: 5.25,
    arcaCode: "TRIBUTO_NACIONAL",
    category: "retencion_nacional",
    province: null,
    description:
      "Percepción de IVA (50% del débito fiscal). RG AFIP 2408. Para agentes de percepción habilitados.",
  },
  {
    key: "RETEN_SUSS_11",
    name: "Retención SUSS 11%",
    rate: 11,
    arcaCode: "TRIBUTO_NACIONAL",
    category: "retencion_nacional",
    province: null,
    description:
      "Retención de Seguridad Social (SUSS/Aportes). Aplicable sobre honorarios.",
  },
  {
    key: "IMPUESTO_PAIS",
    name: "Impuesto PAIS",
    rate: 17.5,
    arcaCode: "TRIBUTO_NACIONAL",
    category: "retencion_nacional",
    province: null,
    description:
      "Impuesto PAIS sobre operaciones en moneda extranjera. Verificar vigencia y alícuota actual.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Impuesto de Sellos por Provincia
// ─────────────────────────────────────────────────────────────────────────────

const SELLOS_RATES: Array<{ province: string; rate: number; note?: string }> = [
  {
    province: "Buenos Aires (ARBA)",
    rate: 1.2,
    note: "Sobre contratos e instrumentos comerciales.",
  },
  { province: "CABA", rate: 1, note: "Actos y contratos onerosos." },
  { province: "Córdoba", rate: 1.2, note: "Instrumentos públicos y privados." },
  {
    province: "Santa Fe",
    rate: 1.2,
    note: "Contratos, facturas y documentos.",
  },
  { province: "Mendoza", rate: 1.5, note: "Instrumentos y contratos." },
  { province: "Tucumán", rate: 1.5, note: "Actos y contratos." },
  { province: "Entre Ríos", rate: 1.2, note: "Instrumentos y contratos." },
  { province: "Salta", rate: 1.2, note: "Actos y contratos." },
  {
    province: "Corrientes",
    rate: 1.5,
    note: "Instrumentos públicos y privados.",
  },
  { province: "Chaco", rate: 1.5, note: "Actos y contratos." },
  { province: "Misiones", rate: 1.5, note: "Actos y contratos." },
  { province: "San Juan", rate: 1.2, note: "Actos y contratos." },
  { province: "Jujuy", rate: 1.2, note: "Actos y contratos." },
  { province: "Neuquén", rate: 1.5, note: "Instrumentos y contratos." },
  { province: "Río Negro", rate: 1.2, note: "Actos y contratos." },
  { province: "Chubut", rate: 1, note: "Actos y contratos." },
  { province: "Santiago del Estero", rate: 1.5, note: "Actos y contratos." },
  { province: "Formosa", rate: 1.5, note: "Instrumentos públicos y privados." },
  { province: "La Rioja", rate: 1.5, note: "Actos y contratos." },
  { province: "San Luis", rate: 1, note: "Actos y contratos." },
  { province: "La Pampa", rate: 1, note: "Actos y contratos." },
  { province: "Catamarca", rate: 1.5, note: "Actos y contratos." },
  { province: "Santa Cruz", rate: 1.5, note: "Instrumentos y contratos." },
  { province: "Tierra del Fuego", rate: 1, note: "Instrumentos y contratos." },
];

const SELLOS_TAXES: CatalogTax[] = SELLOS_RATES.map(
  ({ province, rate, note }) => ({
    key: `SELLOS_${province.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
    name: `Sellos ${province}`,
    rate,
    arcaCode: "TRIBUTO_SELLOS",
    category: "sellos" as TaxCatalogCategory,
    province,
    description: `Impuesto de Sellos ${province}. ${note ?? ""} Alícuota orientativa — verificar con contador.`,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Tasas Municipales (ejemplos principales)
// ─────────────────────────────────────────────────────────────────────────────

const MUNICIPAL_TAXES: CatalogTax[] = [
  {
    key: "MUNICIPAL_SEGURIDAD_HIGIENE",
    name: "Tasa Seguridad e Higiene",
    rate: 0.5,
    arcaCode: "TRIBUTO_MUNICIPAL",
    category: "municipal",
    province: null,
    description:
      "Tasa municipal de seguridad e higiene sobre facturación. Alícuota orientativa — varía por municipio.",
  },
  {
    key: "MUNICIPAL_HABILITACION",
    name: "Tasa de Habilitación",
    rate: 0.3,
    arcaCode: "TRIBUTO_MUNICIPAL",
    category: "municipal",
    province: null,
    description: "Derecho de habilitación comercial. Varía por municipio.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo completo (orden de presentación en UI)
// ─────────────────────────────────────────────────────────────────────────────

export const ARGENTINA_TAX_CATALOG: CatalogTax[] = [
  ...IVA_TAXES,
  ...IIBB_TAXES,
  ...PERCEPCION_TAXES,
  ...RETENCION_IIBB_TAXES,
  ...RETENCION_NACIONAL_TAXES,
  ...SELLOS_TAXES,
  ...MUNICIPAL_TAXES,
];

/** All unique Argentine provinces in the catalog */
export const CATALOG_PROVINCES = [
  "Buenos Aires (ARBA)",
  "CABA",
  "Córdoba",
  "Santa Fe",
  "Mendoza",
  "Tucumán",
  "Entre Ríos",
  "Salta",
  "Misiones",
  "Chaco",
  "Corrientes",
  "Santiago del Estero",
  "Jujuy",
  "Río Negro",
  "Neuquén",
  "Formosa",
  "Chubut",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "La Pampa",
  "Catamarca",
  "La Rioja",
  "Tierra del Fuego",
] as const;

export type CatalogProvince = (typeof CATALOG_PROVINCES)[number];

/** Get catalog taxes by category */
export function getCatalogByCategory(
  category: TaxCatalogCategory
): CatalogTax[] {
  return ARGENTINA_TAX_CATALOG.filter((t) => t.category === category);
}

/** Get catalog taxes by province (across all categories) */
export function getCatalogByProvince(province: string): CatalogTax[] {
  return ARGENTINA_TAX_CATALOG.filter((t) => t.province === province);
}

/** Get catalog taxes that don't require province selection */
export function getNationalCatalogTaxes(): CatalogTax[] {
  return ARGENTINA_TAX_CATALOG.filter((t) => t.province === null);
}
