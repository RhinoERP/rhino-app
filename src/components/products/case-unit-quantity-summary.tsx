import {
  formatCaseUnitQuantity,
  type QuantitySummaryItem,
  summarizeCaseQuantities,
} from "@/modules/inventory/utils/case-units";

export function CaseUnitQuantitySummary({
  items,
}: {
  items: QuantitySummaryItem[];
}) {
  const { cases, otherUnits, hasOtherProducts } =
    summarizeCaseQuantities(items);
  if (cases.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Unidades totales</span>
        <span>{otherUnits.toLocaleString("es-AR")}</span>
      </div>
    );
  }
  const singleProduct = cases.length === 1 && !hasOtherProducts;
  return (
    <div className="space-y-2 text-sm">
      {!singleProduct && (
        <p className="text-muted-foreground">Cantidades por producto</p>
      )}
      {cases.map((item) => (
        <div
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
          key={`${item.productId}:${item.unitsPerBox}`}
        >
          <span className="min-w-0 text-muted-foreground">
            {singleProduct ? "Cantidad total" : item.name}
          </span>
          <span
            className="tabular-nums"
            title={`${item.quantity} unidades individuales`}
          >
            {formatCaseUnitQuantity(item.quantity, item.unitsPerBox ?? 0)}
          </span>
        </div>
      ))}
      {hasOtherProducts && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">
            Unidades de otros productos
          </span>
          <span>{otherUnits.toLocaleString("es-AR")}</span>
        </div>
      )}
    </div>
  );
}
