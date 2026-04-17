import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CreditCardIcon,
  PackageIcon,
  ReceiptIcon,
  UserIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { DirectSalePrintButton } from "@/components/pos-sales/direct-sale-print-button";
import { PosSaleReturnDialog } from "@/components/pos-sales/pos-sale-return-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatPosPaymentMethodLabel } from "@/modules/pos/utils/payment-method";
import type {
  DirectSaleDetail as DirectSaleDetailData,
  TicketCompanyData,
} from "@/modules/sales/types";

type DirectSaleDetailProps = {
  orgSlug: string;
  sale: DirectSaleDetailData;
  company: TicketCompanyData;
};

function resolveCustomerName(sale: DirectSaleDetailData): string {
  if (!sale.customer) {
    return "Consumidor final";
  }

  return sale.customer.fantasy_name || sale.customer.business_name;
}

function resolveSellerName(sale: DirectSaleDetailData): string {
  if (sale.user?.name) {
    return sale.user.name;
  }

  if (sale.user?.email) {
    return sale.user.email;
  }

  if (sale.user_id) {
    return `Usuario ${sale.user_id.slice(0, 8)}`;
  }

  return "Sin usuario";
}

function getSaleStatusLabel(status: string | null): {
  label: string;
  className: string;
} {
  const normalized = status?.toUpperCase().trim() ?? "COMPLETED";

  if (normalized === "COMPLETED") {
    return {
      label: "Completada",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  if (normalized === "CANCELLED") {
    return {
      label: "Cancelada",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }

  return {
    label: normalized,
    className: "bg-muted text-muted-foreground border-muted",
  };
}

function formatQuantity(value: number): string {
  const normalized = Number(value ?? 0);
  const rounded = Math.round(normalized * 1_000_000) / 1_000_000;

  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(2);
}

function resolveDiscountPercent(params: {
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}): number {
  const gross = params.quantity * params.unitPrice;

  if (gross <= 0) {
    return 0;
  }

  return Math.min(Math.max((params.discountAmount / gross) * 100, 0), 100);
}

export function DirectSaleDetail({
  orgSlug,
  sale,
  company,
}: DirectSaleDetailProps) {
  const summary = sale.returnSummary ?? {
    returnsCount: 0,
    totalReturnedAmount: 0,
    totalRefundedAmount: 0,
    totalCreditedAmount: 0,
    pendingReturnableAmount: Number(sale.total_amount ?? 0),
  };
  const status = getSaleStatusLabel(sale.status);
  const saleDateLabel = sale.sale_date
    ? formatDate(sale.sale_date, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sin fecha";
  const totalPaid = sale.payments.reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0
  );
  const paymentMethods = Array.from(
    new Set(
      sale.payments.map((payment) =>
        formatPosPaymentMethodLabel(String(payment.payment_method))
      )
    )
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button asChild className="px-0" size="sm" variant="ghost">
          <Link href={`/org/${orgSlug}/venta-directa`}>
            <ArrowLeftIcon className="size-4" weight="bold" />
            Volver a ventas directas
          </Link>
        </Button>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-heading text-2xl">Detalle de venta directa</h1>
            <p className="text-muted-foreground text-sm">
              {sale.receipt_number ?? sale.id} · {saleDateLabel}
            </p>
          </div>
          <Badge className={status.className} variant="outline">
            {status.label}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="space-y-4 xl:flex-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información general</CardTitle>
              <CardDescription>
                Datos de cliente, comprobante y estado de la venta.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <UserIcon
                  className="size-4 text-muted-foreground"
                  weight="bold"
                />
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-medium">{resolveCustomerName(sale)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <UserIcon
                  className="size-4 text-muted-foreground"
                  weight="bold"
                />
                <span className="text-muted-foreground">Usuario:</span>
                <span className="font-medium">{resolveSellerName(sale)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ReceiptIcon
                  className="size-4 text-muted-foreground"
                  weight="bold"
                />
                <span className="text-muted-foreground">Comprobante:</span>
                <span className="font-medium">
                  {sale.receipt_number ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <PackageIcon
                  className="size-4 text-muted-foreground"
                  weight="bold"
                />
                <span className="text-muted-foreground">Ítems:</span>
                <span className="font-medium">{sale.items.length}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CreditCardIcon
                  className="size-4 text-muted-foreground"
                  weight="bold"
                />
                <span className="text-muted-foreground">Pago:</span>
                <span className="font-medium">
                  {paymentMethods.length
                    ? paymentMethods.join(", ")
                    : "Sin pago"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Productos de la venta</CardTitle>
              <CardDescription>
                Detalle de productos vendidos en mostrador.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border">
                {sale.items.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    Esta venta no tiene ítems registrados.
                  </div>
                ) : (
                  <div className="divide-y">
                    {sale.items.map((item) => {
                      const quantity = Number(item.quantity ?? 0);
                      const unitPrice = Number(item.unit_price ?? 0);
                      const discountAmount = Number(item.discount_amount ?? 0);
                      const subtotal = Number(item.subtotal ?? 0);
                      const discountPercent = resolveDiscountPercent({
                        quantity,
                        unitPrice,
                        discountAmount,
                      });

                      return (
                        <div
                          className="grid gap-4 px-4 py-3 sm:grid-cols-[minmax(0,_2fr)_repeat(4,minmax(88px,_1fr))_minmax(120px,_1fr)] sm:items-center"
                          key={item.id}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">
                                {item.product?.name ?? "Producto"}
                              </p>
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {item.product?.sku ?? "—"} ·{" "}
                              {formatCurrency(unitPrice)} x unidad
                            </p>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Cantidad (uds)
                            </span>
                            <Input
                              className="h-8 w-full min-w-[80px]"
                              disabled
                              value={formatQuantity(quantity)}
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Precio unitario
                            </span>
                            <Input
                              className="h-8 w-full min-w-[96px]"
                              disabled
                              value={
                                unitPrice > 0 ? unitPrice.toFixed(2) : "0.00"
                              }
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Peso
                            </span>
                            <Input
                              className="h-8 w-full"
                              disabled
                              value="No aplica"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Descuento %
                            </span>
                            <Input
                              className="h-8 w-full min-w-[80px]"
                              disabled
                              value={
                                discountPercent > 0
                                  ? discountPercent.toFixed(2)
                                  : ""
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between sm:justify-end">
                            <div className="flex flex-col items-start gap-1 sm:items-end">
                              <span className="text-muted-foreground text-xs">
                                Subtotal
                              </span>
                              <p className="font-medium">
                                {formatCurrency(subtotal)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full xl:w-80 xl:max-w-xs">
          <div className="sticky top-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen de venta</CardTitle>
                <CardDescription>
                  Totales, devoluciones y saldo pendiente de reintegrar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total venta</span>
                  <span>{formatCurrency(Number(sale.total_amount ?? 0))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pagado</span>
                  <span>{formatCurrency(totalPaid)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Devuelto</span>
                  <span>{formatCurrency(summary.totalReturnedAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Reintegrado</span>
                  <span>{formatCurrency(summary.totalRefundedAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Nota de crédito</span>
                  <span>{formatCurrency(summary.totalCreditedAmount)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between font-semibold text-base">
                  <span>Saldo pendiente</span>
                  <span>{formatCurrency(summary.pendingReturnableAmount)}</span>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <DirectSalePrintButton company={company} sale={sale} />
                <PosSaleReturnDialog
                  orgSlug={orgSlug}
                  sale={sale}
                  trigger={
                    <Button
                      className="w-full justify-between"
                      variant="outline"
                    >
                      <div className="flex items-center">
                        <ArrowsClockwiseIcon
                          className="mr-2 size-4"
                          weight="bold"
                        />
                        Registrar devolución
                      </div>
                    </Button>
                  }
                />
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
