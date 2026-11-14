/**
 * Generador de reportes · catálogo de datos del negocio.
 *
 * Cada "fuente" es un conjunto de datos (ventas, compras, stock…) con las
 * formas de agruparlo (dimensiones) y lo que se puede medir (métricas). Es
 * puro: lo usan la pantalla, el motor y RHINO para armar reportes.
 */

export type MeasureFormat = "money" | "number" | "decimal" | "percent";

export type Aggregation =
  | { kind: "sum"; field: string }
  | { kind: "count" }
  | { kind: "distinct"; field: string }
  | {
      kind: "ratio";
      num: string;
      /** Divide por la suma de un campo, por la cantidad de filas o por valores distintos. */
      den: { sum: string } | { count: true } | { distinct: string };
      scale?: number;
    };

export type Measure = {
  key: string;
  label: string;
  format: MeasureFormat;
  agg: Aggregation;
  hint?: string;
};

export type Dimension = {
  key: string;
  label: string;
  /** "date" se agrupa por día, semana, mes, trimestre o año. */
  type?: "date";
};

export type DatasetGroup =
  | "Ventas"
  | "Clientes"
  | "Cobranzas"
  | "Compras"
  | "Finanzas"
  | "Stock"
  | "Equipo";

export type Dataset = {
  id: string;
  label: string;
  group: DatasetGroup;
  description: string;
  /** Alcanza con tener uno de estos permisos (organization.admin ve todo). */
  permissions: string[];
  /** Si tiene fecha, se filtra por período; si no, es una foto de hoy. */
  dated: boolean;
  dateLabel?: string;
  /** Para un vendedor, solo sus clientes. */
  sellerScoped: boolean;
  dimensions: Dimension[];
  measures: Measure[];
  defaultGroupBy: string | null;
  defaultMeasures: string[];
};

const SALES = [
  "sales.read",
  "sales.manage",
  "commercial_ai.read",
  "commercial_ai.manage",
];
const COLLECTIONS = [
  "collections.read",
  "collections.manage",
  "commercial_ai.read",
  "commercial_ai.manage",
];
const PURCHASES = ["purchases.read", "purchases.manage"];
const PAYABLES = [
  "finances.read",
  "finances.manage",
  "treasury.read",
  "treasury.manage",
  "purchases.manage",
];

const FECHA: Dimension = { key: "fecha", label: "Fecha", type: "date" };
const DIA_SEMANA: Dimension = { key: "dia_semana", label: "Día de la semana" };

const CUSTOMER_DIMS: Dimension[] = [
  { key: "cliente", label: "Cliente" },
  { key: "vendedor", label: "Vendedor" },
  { key: "canal", label: "Canal" },
  { key: "localidad", label: "Localidad" },
  { key: "provincia", label: "Provincia" },
];

const PRODUCT_DIMS: Dimension[] = [
  { key: "producto", label: "Producto" },
  { key: "marca", label: "Marca" },
  { key: "categoria", label: "Categoría" },
  { key: "proveedor", label: "Proveedor" },
];

const sum = (field: string): Aggregation => ({ kind: "sum", field });

export const DATASETS: Dataset[] = [
  {
    id: "ventas",
    label: "Ventas",
    group: "Ventas",
    description: "Facturación por comprobante: cuánto, a quién y quién vendió.",
    permissions: SALES,
    dated: true,
    dateLabel: "Fecha de venta",
    sellerScoped: true,
    dimensions: [
      FECHA,
      DIA_SEMANA,
      ...CUSTOMER_DIMS,
      { key: "condicion_iva", label: "Condición de IVA" },
      { key: "comprobante", label: "Tipo de comprobante" },
      { key: "deposito", label: "Depósito" },
      { key: "estado", label: "Estado" },
    ],
    measures: [
      {
        key: "facturacion",
        label: "Facturación",
        format: "money",
        agg: sum("total"),
      },
      {
        key: "neto",
        label: "Neto (sin impuestos)",
        format: "money",
        agg: sum("neto"),
      },
      {
        key: "impuestos",
        label: "Impuestos",
        format: "money",
        agg: sum("impuestos"),
      },
      {
        key: "ventas",
        label: "Cantidad de ventas",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "ticket",
        label: "Ticket promedio",
        format: "money",
        agg: { kind: "ratio", num: "total", den: { count: true } },
      },
      {
        key: "clientes",
        label: "Clientes que compraron",
        format: "number",
        agg: { kind: "distinct", field: "cliente_id" },
      },
      {
        key: "descuentos",
        label: "Descuentos",
        format: "money",
        agg: sum("descuento"),
      },
    ],
    defaultGroupBy: "fecha",
    defaultMeasures: ["facturacion", "ventas"],
  },
  {
    id: "ventas_productos",
    label: "Ventas por producto",
    group: "Ventas",
    description:
      "Qué se vendió: productos, marcas, categorías, kilos y unidades.",
    permissions: SALES,
    dated: true,
    dateLabel: "Fecha de venta",
    sellerScoped: true,
    dimensions: [
      FECHA,
      DIA_SEMANA,
      ...PRODUCT_DIMS,
      ...CUSTOMER_DIMS,
      { key: "deposito", label: "Depósito" },
    ],
    measures: [
      {
        key: "importe",
        label: "Importe vendido",
        format: "money",
        agg: sum("importe"),
      },
      {
        key: "unidades",
        label: "Unidades / piezas",
        format: "decimal",
        agg: sum("unidades"),
      },
      {
        key: "kilos",
        label: "Kilos / litros",
        format: "decimal",
        agg: sum("kilos"),
      },
      {
        key: "precio_promedio",
        label: "Precio promedio por unidad",
        format: "money",
        agg: { kind: "ratio", num: "importe", den: { sum: "unidades" } },
      },
      {
        key: "pedidos",
        label: "Ventas donde aparece",
        format: "number",
        agg: { kind: "distinct", field: "venta_id" },
      },
      {
        key: "clientes",
        label: "Clientes que lo compraron",
        format: "number",
        agg: { kind: "distinct", field: "cliente_id" },
      },
      {
        key: "productos",
        label: "Productos distintos",
        format: "number",
        agg: { kind: "distinct", field: "producto_id" },
      },
      {
        key: "descuentos",
        label: "Descuentos",
        format: "money",
        agg: sum("descuento"),
      },
    ],
    defaultGroupBy: "producto",
    defaultMeasures: ["importe", "unidades"],
  },
  {
    id: "notas_credito",
    label: "Notas de crédito",
    group: "Ventas",
    description: "Devoluciones y bonificaciones a clientes.",
    permissions: ["creditnotes.read", "creditnotes.manage"],
    dated: true,
    dateLabel: "Fecha de emisión",
    sellerScoped: true,
    dimensions: [
      FECHA,
      ...CUSTOMER_DIMS,
      { key: "motivo", label: "Motivo" },
      { key: "origen", label: "Origen" },
    ],
    measures: [
      { key: "monto", label: "Monto", format: "money", agg: sum("monto") },
      {
        key: "notas",
        label: "Cantidad",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "clientes",
        label: "Clientes",
        format: "number",
        agg: { kind: "distinct", field: "cliente_id" },
      },
    ],
    defaultGroupBy: "fecha",
    defaultMeasures: ["monto", "notas"],
  },
  {
    id: "mostrador",
    label: "Venta en mostrador (POS)",
    group: "Ventas",
    description: "Tickets de la caja: totales, cantidad y ticket promedio.",
    permissions: ["pos.read", "pos.manage"],
    dated: true,
    dateLabel: "Fecha del ticket",
    sellerScoped: false,
    dimensions: [
      FECHA,
      DIA_SEMANA,
      { key: "comprobante", label: "Comprobante" },
    ],
    measures: [
      {
        key: "total",
        label: "Total vendido",
        format: "money",
        agg: sum("total"),
      },
      {
        key: "tickets",
        label: "Tickets",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "ticket",
        label: "Ticket promedio",
        format: "money",
        agg: { kind: "ratio", num: "total", den: { count: true } },
      },
    ],
    defaultGroupBy: "fecha",
    defaultMeasures: ["total", "tickets"],
  },
  {
    id: "clientes",
    label: "Cartera de clientes",
    group: "Clientes",
    description: "Cuántos clientes hay, dónde están y de quién son.",
    permissions: [
      "customers.read",
      "customers.manage",
      "commercial_ai.read",
      "commercial_ai.manage",
    ],
    dated: false,
    sellerScoped: true,
    dimensions: [
      { key: "vendedor", label: "Vendedor" },
      { key: "canal", label: "Canal" },
      { key: "localidad", label: "Localidad" },
      { key: "provincia", label: "Provincia" },
      { key: "condicion_iva", label: "Condición de IVA" },
      { key: "mes_alta", label: "Mes de alta" },
    ],
    measures: [
      {
        key: "clientes",
        label: "Clientes",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "limite",
        label: "Límite de crédito total",
        format: "money",
        agg: sum("limite"),
      },
    ],
    defaultGroupBy: "vendedor",
    defaultMeasures: ["clientes"],
  },
  {
    id: "cobranzas",
    label: "Cobranzas",
    group: "Cobranzas",
    description: "Lo que se cobró: por cliente, vendedor y medio de pago.",
    permissions: COLLECTIONS,
    dated: true,
    dateLabel: "Fecha de cobro",
    sellerScoped: true,
    dimensions: [
      FECHA,
      DIA_SEMANA,
      ...CUSTOMER_DIMS,
      { key: "medio", label: "Medio de pago" },
    ],
    measures: [
      {
        key: "cobrado",
        label: "Cobrado",
        format: "money",
        agg: sum("cobrado"),
      },
      {
        key: "cobros",
        label: "Cantidad de cobros",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "promedio",
        label: "Cobro promedio",
        format: "money",
        agg: { kind: "ratio", num: "cobrado", den: { count: true } },
      },
      {
        key: "clientes",
        label: "Clientes que pagaron",
        format: "number",
        agg: { kind: "distinct", field: "cliente_id" },
      },
    ],
    defaultGroupBy: "fecha",
    defaultMeasures: ["cobrado", "cobros"],
  },
  {
    id: "deuda_clientes",
    label: "Cuenta corriente de clientes",
    group: "Cobranzas",
    description: "Lo que deben hoy los clientes, vencido y por vencer.",
    permissions: COLLECTIONS,
    dated: false,
    sellerScoped: true,
    dimensions: [
      ...CUSTOMER_DIMS,
      { key: "antiguedad", label: "Antigüedad de la deuda" },
      { key: "mes_vencimiento", label: "Mes de vencimiento" },
    ],
    measures: [
      {
        key: "saldo",
        label: "Saldo pendiente",
        format: "money",
        agg: sum("saldo"),
      },
      {
        key: "vencido",
        label: "Vencido",
        format: "money",
        agg: sum("vencido"),
      },
      {
        key: "porc_vencido",
        label: "% vencido",
        format: "percent",
        agg: {
          kind: "ratio",
          num: "vencido",
          den: { sum: "saldo" },
          scale: 100,
        },
      },
      {
        key: "comprobantes",
        label: "Comprobantes",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "clientes",
        label: "Clientes con deuda",
        format: "number",
        agg: { kind: "distinct", field: "cliente_id" },
      },
    ],
    defaultGroupBy: "antiguedad",
    defaultMeasures: ["saldo", "clientes"],
  },
  {
    id: "compras",
    label: "Compras",
    group: "Compras",
    description: "Lo que se compró a cada proveedor.",
    permissions: PURCHASES,
    dated: true,
    dateLabel: "Fecha de compra",
    sellerScoped: false,
    dimensions: [
      FECHA,
      { key: "proveedor", label: "Proveedor" },
      { key: "estado", label: "Estado" },
      { key: "moneda", label: "Moneda" },
    ],
    measures: [
      {
        key: "total",
        label: "Total comprado",
        format: "money",
        agg: sum("total"),
      },
      { key: "neto", label: "Neto", format: "money", agg: sum("neto") },
      {
        key: "impuestos",
        label: "Impuestos",
        format: "money",
        agg: sum("impuestos"),
      },
      {
        key: "compras",
        label: "Cantidad de compras",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "promedio",
        label: "Compra promedio",
        format: "money",
        agg: { kind: "ratio", num: "total", den: { count: true } },
      },
      {
        key: "proveedores",
        label: "Proveedores",
        format: "number",
        agg: { kind: "distinct", field: "proveedor_id" },
      },
    ],
    defaultGroupBy: "proveedor",
    defaultMeasures: ["total", "compras"],
  },
  {
    id: "compras_productos",
    label: "Compras por producto",
    group: "Compras",
    description: "Qué se compró, cuánto y a qué costo.",
    permissions: PURCHASES,
    dated: true,
    dateLabel: "Fecha de compra",
    sellerScoped: false,
    dimensions: [FECHA, ...PRODUCT_DIMS],
    measures: [
      {
        key: "importe",
        label: "Importe comprado",
        format: "money",
        agg: sum("importe"),
      },
      {
        key: "unidades",
        label: "Unidades / piezas",
        format: "decimal",
        agg: sum("unidades"),
      },
      {
        key: "kilos",
        label: "Kilos / litros",
        format: "decimal",
        agg: sum("kilos"),
      },
      {
        key: "costo_promedio",
        label: "Costo promedio por unidad",
        format: "money",
        agg: { kind: "ratio", num: "importe", den: { sum: "unidades" } },
      },
      {
        key: "compras",
        label: "Compras donde aparece",
        format: "number",
        agg: { kind: "distinct", field: "compra_id" },
      },
    ],
    defaultGroupBy: "producto",
    defaultMeasures: ["importe", "unidades"],
  },
  {
    id: "pagos_proveedores",
    label: "Pagos a proveedores",
    group: "Finanzas",
    description: "Lo que se le pagó a cada proveedor y con qué medio.",
    permissions: PAYABLES,
    dated: true,
    dateLabel: "Fecha de pago",
    sellerScoped: false,
    dimensions: [
      FECHA,
      { key: "proveedor", label: "Proveedor" },
      { key: "medio", label: "Medio de pago" },
    ],
    measures: [
      { key: "pagado", label: "Pagado", format: "money", agg: sum("pagado") },
      {
        key: "pagos",
        label: "Cantidad de pagos",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "proveedores",
        label: "Proveedores",
        format: "number",
        agg: { kind: "distinct", field: "proveedor_id" },
      },
    ],
    defaultGroupBy: "proveedor",
    defaultMeasures: ["pagado"],
  },
  {
    id: "deuda_proveedores",
    label: "Cuenta corriente con proveedores",
    group: "Finanzas",
    description: "Lo que se les debe hoy a los proveedores.",
    permissions: PAYABLES,
    dated: false,
    sellerScoped: false,
    dimensions: [
      { key: "proveedor", label: "Proveedor" },
      { key: "antiguedad", label: "Antigüedad de la deuda" },
      { key: "mes_vencimiento", label: "Mes de vencimiento" },
      { key: "moneda", label: "Moneda original" },
    ],
    measures: [
      {
        key: "saldo",
        label: "Saldo pendiente",
        format: "money",
        agg: sum("saldo"),
      },
      {
        key: "vencido",
        label: "Vencido",
        format: "money",
        agg: sum("vencido"),
      },
      {
        key: "comprobantes",
        label: "Comprobantes",
        format: "number",
        agg: { kind: "count" },
      },
    ],
    defaultGroupBy: "proveedor",
    defaultMeasures: ["saldo", "vencido"],
  },
  {
    id: "gastos",
    label: "Gastos",
    group: "Finanzas",
    description: "Gastos de la empresa por categoría, fijos y variables.",
    permissions: ["finances.read", "finances.manage"],
    dated: true,
    dateLabel: "Fecha del gasto",
    sellerScoped: false,
    dimensions: [
      FECHA,
      { key: "categoria", label: "Categoría" },
      { key: "tipo", label: "Fijo o variable" },
      { key: "medio", label: "Medio de pago" },
    ],
    measures: [
      { key: "monto", label: "Monto", format: "money", agg: sum("monto") },
      {
        key: "gastos",
        label: "Cantidad",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "promedio",
        label: "Gasto promedio",
        format: "money",
        agg: { kind: "ratio", num: "monto", den: { count: true } },
      },
    ],
    defaultGroupBy: "categoria",
    defaultMeasures: ["monto"],
  },
  {
    id: "stock",
    label: "Stock",
    group: "Stock",
    description: "Existencias de hoy, valorizadas, faltantes y bajo mínimo.",
    permissions: ["inventory.read", "inventory.manage"],
    dated: false,
    sellerScoped: false,
    dimensions: [
      ...PRODUCT_DIMS,
      { key: "estado_stock", label: "Estado del stock" },
      { key: "unidad", label: "Unidad de medida" },
    ],
    measures: [
      { key: "stock", label: "Stock", format: "decimal", agg: sum("stock") },
      {
        key: "valorizado",
        label: "Valorizado a precio de venta",
        format: "money",
        agg: sum("valorizado"),
      },
      {
        key: "productos",
        label: "Productos",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "sin_stock",
        label: "Sin stock",
        format: "number",
        agg: sum("sin_stock"),
      },
      {
        key: "bajo_minimo",
        label: "Bajo el mínimo",
        format: "number",
        agg: sum("bajo_minimo"),
      },
    ],
    defaultGroupBy: "categoria",
    defaultMeasures: ["valorizado", "productos"],
  },
  {
    id: "actividad",
    label: "Actividad comercial",
    group: "Equipo",
    description: "Visitas, llamadas y acciones registradas por el equipo.",
    permissions: ["commercial_ai.read", "commercial_ai.manage"],
    dated: true,
    dateLabel: "Fecha",
    sellerScoped: true,
    dimensions: [
      FECHA,
      DIA_SEMANA,
      { key: "vendedor", label: "Vendedor" },
      { key: "tipo", label: "Tipo de acción" },
      { key: "cliente", label: "Cliente" },
    ],
    measures: [
      {
        key: "acciones",
        label: "Acciones",
        format: "number",
        agg: { kind: "count" },
      },
      {
        key: "clientes",
        label: "Clientes trabajados",
        format: "number",
        agg: { kind: "distinct", field: "cliente_id" },
      },
    ],
    defaultGroupBy: "vendedor",
    defaultMeasures: ["acciones", "clientes"],
  },
];

export const DATASET_GROUPS: DatasetGroup[] = [
  "Ventas",
  "Clientes",
  "Cobranzas",
  "Compras",
  "Finanzas",
  "Stock",
  "Equipo",
];

export function datasetById(id: string): Dataset | undefined {
  return DATASETS.find((d) => d.id === id);
}

export function canUseDataset(
  dataset: Dataset,
  permissions: string[]
): boolean {
  return (
    permissions.includes("organization.admin") ||
    dataset.permissions.some((p) => permissions.includes(p))
  );
}

/* ============ Especificación de un reporte ============ */

export const PERIOD_PRESETS = [
  { key: "hoy", label: "Hoy" },
  { key: "ayer", label: "Ayer" },
  { key: "esta_semana", label: "Esta semana" },
  { key: "semana_pasada", label: "Semana pasada" },
  { key: "este_mes", label: "Este mes" },
  { key: "mes_pasado", label: "Mes pasado" },
  { key: "ultimos_30", label: "Últimos 30 días" },
  { key: "ultimos_90", label: "Últimos 90 días" },
  { key: "este_trimestre", label: "Este trimestre" },
  { key: "trimestre_pasado", label: "Trimestre pasado" },
  { key: "este_anio", label: "Este año" },
  { key: "anio_pasado", label: "Año pasado" },
  { key: "ultimos_12_meses", label: "Últimos 12 meses" },
  { key: "personalizado", label: "Elegir fechas" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["key"];

export const GRAINS = [
  { key: "dia", label: "Día" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "trimestre", label: "Trimestre" },
  { key: "anio", label: "Año" },
] as const;

export type Grain = (typeof GRAINS)[number]["key"];

export const CHARTS = [
  { key: "bar", label: "Barras" },
  { key: "line", label: "Líneas" },
  { key: "area", label: "Área" },
  { key: "pie", label: "Torta" },
  { key: "table", label: "Solo tabla" },
] as const;

export type ChartKind = (typeof CHARTS)[number]["key"];

export type ReportFilter = { dimension: string; values: string[] };

export type ReportSpec = {
  dataset: string;
  groupBy: string | null;
  /** Segunda forma de abrir los datos (series del gráfico). */
  splitBy: string | null;
  measures: string[];
  period: PeriodPreset;
  from?: string | null;
  to?: string | null;
  grain: Grain;
  filters: ReportFilter[];
  sort: { by: string; dir: "asc" | "desc" } | null;
  limit: number | null;
  chart: ChartKind;
  compare: boolean;
  title?: string | null;
};

export const MAX_MEASURES = 6;
export const MAX_LIMIT = 500;

export function defaultSpec(dataset: Dataset): ReportSpec {
  return {
    dataset: dataset.id,
    groupBy: dataset.defaultGroupBy,
    splitBy: null,
    measures: dataset.defaultMeasures,
    period: "este_mes",
    grain: "dia",
    filters: [],
    sort: null,
    limit: dataset.defaultGroupBy === "fecha" ? null : 20,
    chart: dataset.defaultGroupBy === "fecha" ? "line" : "bar",
    compare: dataset.dated,
    title: null,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deja la especificación en algo que el motor puede correr: saca dimensiones
 * o métricas que no existen en la fuente y completa lo que falte.
 */
export function sanitizeSpec(input: Partial<ReportSpec>): ReportSpec | null {
  const dataset = datasetById(String(input.dataset ?? ""));
  if (!dataset) {
    return null;
  }
  const base = defaultSpec(dataset);
  const dims = new Set(dataset.dimensions.map((d) => d.key));
  const measureKeys = new Set(dataset.measures.map((m) => m.key));
  const groupBy = pickGroupBy(input.groupBy, dims, base.groupBy);
  const measures = (input.measures ?? []).filter((m) => measureKeys.has(m));
  const { period, from, to } = pickPeriod(input, base.period);

  return {
    dataset: dataset.id,
    groupBy,
    splitBy:
      input.splitBy && dims.has(input.splitBy) && input.splitBy !== groupBy
        ? input.splitBy
        : null,
    measures: (measures.length ? measures : base.measures).slice(
      0,
      MAX_MEASURES
    ),
    period,
    from,
    to,
    grain: oneOf(input.grain, GRAINS, base.grain),
    filters: pickFilters(input.filters, dims),
    sort: pickSort(input.sort, measureKeys),
    limit: "limit" in input ? pickLimit(input.limit) : base.limit,
    chart: oneOf(input.chart, CHARTS, base.chart),
    compare: dataset.dated && Boolean(input.compare ?? base.compare),
    title: input.title ? String(input.title).slice(0, 120) : null,
  };
}

function oneOf<T extends string>(
  value: unknown,
  options: readonly { key: T }[],
  fallback: T
): T {
  return options.some((o) => o.key === value) ? (value as T) : fallback;
}

function pickGroupBy(
  value: string | null | undefined,
  dims: Set<string>,
  fallback: string | null
): string | null {
  if (value === null) {
    return null;
  }
  return value && dims.has(value) ? value : fallback;
}

function pickPeriod(
  input: Partial<ReportSpec>,
  fallback: PeriodPreset
): { period: PeriodPreset; from: string | null; to: string | null } {
  const preset = oneOf(input.period, PERIOD_PRESETS, fallback);
  if (preset !== "personalizado") {
    return { period: preset, from: null, to: null };
  }
  const valid =
    ISO_DATE.test(String(input.from)) && ISO_DATE.test(String(input.to));
  return valid
    ? { period: preset, from: input.from as string, to: input.to as string }
    : { period: fallback, from: null, to: null };
}

function pickFilters(
  filters: ReportFilter[] | undefined,
  dims: Set<string>
): ReportFilter[] {
  return (filters ?? [])
    .filter((f) => f && dims.has(f.dimension) && Array.isArray(f.values))
    .map((f) => ({
      dimension: f.dimension,
      values: f.values.map(String).filter(Boolean).slice(0, 50),
    }))
    .filter((f) => f.values.length);
}

function pickSort(
  sort: ReportSpec["sort"] | undefined,
  measureKeys: Set<string>
): ReportSpec["sort"] {
  if (!sort?.by) {
    return null;
  }
  const valid = sort.by === "label" || measureKeys.has(sort.by);
  return valid
    ? { by: sort.by, dir: sort.dir === "asc" ? "asc" : "desc" }
    : null;
}

function pickLimit(value: unknown): number | null {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0
    ? Math.min(Math.round(limit), MAX_LIMIT)
    : null;
}
