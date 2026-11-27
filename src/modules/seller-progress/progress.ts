/** Métricas independientes: no se suman cantidades de distintas unidades. */
export const KPI_FIELDS = [
  "billing",
  "units",
  "kg",
  "lt",
  "boxes",
  "meters",
  "newCustomers",
  "visits",
  "sales",
] as const;

export type KpiField = (typeof KPI_FIELDS)[number];
export type KpiValues = Record<KpiField, number>;

export type SaleFact = {
  id: string;
  sellerId: string;
  customerId: string | null;
  date: string;
  status: string;
  documentType: string;
  amount: number;
  invoiceType: string | null;
  invoiceNumber: string | null;
  arcaStatus: string | null;
  authorizedAt: string | null;
};

export function emptyKpis(): KpiValues {
  return {
    billing: 0,
    units: 0,
    kg: 0,
    lt: 0,
    boxes: 0,
    meters: 0,
    newCustomers: 0,
    visits: 0,
    sales: 0,
  };
}

const SOLD_STATUSES = new Set([
  "CONFIRMED",
  "DISPATCH",
  "DELIVERED",
  "INCOMPLETE",
]);

export function isSoldOrder(sale: SaleFact): boolean {
  return sale.documentType === "STANDARD" && SOLD_STATUSES.has(sale.status);
}

export function isIssuedInvoice(sale: SaleFact): boolean {
  return (
    sale.invoiceType?.startsWith("FACTURA_") === true &&
    (sale.arcaStatus === "authorized" ||
      (Boolean(sale.invoiceNumber?.trim()) &&
        (isSoldOrder(sale) ||
          sale.documentType === "ADVANCE" ||
          sale.documentType === "BALANCE")))
  );
}

/** Fecha local de autorización ARCA; los comprobantes manuales usan la fecha de venta. */
export function invoiceMonth(sale: SaleFact): string {
  if (sale.arcaStatus === "authorized" && sale.authorizedAt) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
      .format(new Date(sale.authorizedAt))
      .slice(0, 7);
  }
  return sale.date.slice(0, 7);
}

/** Primera compra confirmada del par vendedor-cliente, sin usar la cartera actual. */
function firstSalesBySellerCustomer(sales: SaleFact[]): Map<string, string> {
  const firstSale = new Map<string, string>();
  for (const sale of sales) {
    if (!(isSoldOrder(sale) && sale.customerId)) {
      continue;
    }
    const key = `${sale.sellerId}:${sale.customerId}`;
    const day = sale.date.slice(0, 10);
    const earliest = firstSale.get(key);
    if (!earliest || day < earliest) {
      firstSale.set(key, day);
    }
  }
  return firstSale;
}

function countNewCustomer(
  sale: SaleFact,
  month: string,
  firstSale: Map<string, string>,
  seen: Set<string>
): boolean {
  if (!sale.customerId) {
    return false;
  }
  const key = `${sale.sellerId}:${sale.customerId}`;
  if (seen.has(key) || firstSale.get(key)?.slice(0, 7) !== month.slice(0, 7)) {
    return false;
  }
  seen.add(key);
  return true;
}

/** El importe facturado y la venta pueden caer en meses diferentes. */
export function monthlySellerKpis(
  sales: SaleFact[],
  month: string
): Map<string, KpiValues> {
  const firstSale = firstSalesBySellerCustomer(sales);
  const result = new Map<string, KpiValues>();
  const newCustomerKeys = new Set<string>();
  for (const sale of sales) {
    const kpis = result.get(sale.sellerId) ?? emptyKpis();
    if (isIssuedInvoice(sale) && invoiceMonth(sale) === month.slice(0, 7)) {
      kpis.billing += sale.amount;
    }
    if (isSoldOrder(sale) && sale.date.slice(0, 7) === month.slice(0, 7)) {
      kpis.sales += 1;
      if (countNewCustomer(sale, month, firstSale, newCustomerKeys)) {
        kpis.newCustomers += 1;
      }
    }
    result.set(sale.sellerId, kpis);
  }
  return result;
}

export type SoldItem = {
  quantity: number;
  unitQuantity: number | null;
  unitOfMeasure: string;
  unitsPerBox: number | null;
};

/** CAJA almacena unidades individuales: cajas completas + unidades sueltas. */
export function quantityKpis(
  item: SoldItem
): Pick<KpiValues, "units" | "kg" | "lt" | "boxes" | "meters"> {
  const result = { units: 0, kg: 0, lt: 0, boxes: 0, meters: 0 };
  const quantity = Number(item.quantity) || 0;
  const measured = Number(item.unitQuantity ?? item.quantity) || 0;
  switch (item.unitOfMeasure) {
    case "KG":
      result.kg = measured;
      break;
    case "LT":
      result.lt = measured;
      break;
    case "MT":
      result.meters = measured;
      break;
    case "CAJA":
      if (
        Number.isSafeInteger(quantity) &&
        quantity >= 0 &&
        Number.isSafeInteger(item.unitsPerBox) &&
        (item.unitsPerBox ?? 0) > 0
      ) {
        result.boxes = Math.floor(quantity / (item.unitsPerBox as number));
        result.units = quantity % (item.unitsPerBox as number);
      } else {
        result.units = quantity;
      }
      break;
    default:
      result.units = quantity;
  }
  return result;
}
