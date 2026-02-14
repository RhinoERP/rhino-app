import {
  CurrencyDollarSimpleIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  WalletIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { PosSale } from "@/modules/pos-sales/types";

type DirectSalesMetricsProps = {
  sales: PosSale[];
};

const BUENOS_AIRES_TIMEZONE = "America/Argentina/Buenos_Aires";

function getCurrentMonthRangeBuenosAires(): {
  startDate: string;
  endDate: string;
} | null {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUENOS_AIRES_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!(Number.isFinite(year) && Number.isFinite(month))) {
    return null;
  }

  const monthStr = String(month).padStart(2, "0");
  const startDate = `${year}-${monthStr}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${monthStr}-${String(endDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

function isCashPaymentMethod(method: string): boolean {
  const normalized = method.toLowerCase().trim();
  return normalized === "efectivo";
}

export function DirectSalesMetrics({ sales }: DirectSalesMetricsProps) {
  const range = getCurrentMonthRangeBuenosAires();

  const currentMonthSales = range
    ? sales.filter((sale) => {
        if (!sale.sale_date) {
          return false;
        }

        const saleDate = sale.sale_date.split("T")[0];
        return saleDate >= range.startDate && saleDate <= range.endDate;
      })
    : [];

  const totalSales = currentMonthSales.length;
  const totalAmount = currentMonthSales.reduce(
    (sum, sale) => sum + (sale.total_amount ?? 0),
    0
  );
  const averageTicket = totalSales > 0 ? totalAmount / totalSales : 0;

  const cashAmount = currentMonthSales.reduce((sum, sale) => {
    const cashPayments = sale.payments.filter((payment) =>
      isCashPaymentMethod(String(payment.payment_method))
    );

    const cashTotalForSale = cashPayments.reduce(
      (saleSum, payment) => saleSum + (payment.amount ?? 0),
      0
    );

    return sum + cashTotalForSale;
  }, 0);

  return (
    <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ShoppingBagIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Ventas directas del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{totalSales}</div>
          <p className="text-muted-foreground text-xs">
            Ventas registradas y cobradas en el mes actual
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CurrencyDollarSimpleIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Total vendido</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(totalAmount)}
          </div>
          <p className="text-muted-foreground text-xs">
            Importe total facturado en venta directa
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ReceiptIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Ticket promedio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(averageTicket)}
          </div>
          <p className="text-muted-foreground text-xs">
            Promedio por operación en el mes actual
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <WalletIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Cobros en efectivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{formatCurrency(cashAmount)}</div>
          <p className="text-muted-foreground text-xs">
            Total cobrado en efectivo durante el mes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
