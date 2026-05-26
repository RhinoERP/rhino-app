import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteStatusManager } from "@/components/quotes/quote-status-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { getQuoteById } from "@/modules/quotes/actions/get-quote-by-id.action";

type QuoteEditPageProps = {
  params: Promise<{ orgSlug: string; quoteId: string }>;
};

export default async function QuoteEditPage({ params }: QuoteEditPageProps) {
  const { orgSlug, quoteId } = await params;

  const quote = await getQuoteById(quoteId);
  if (!quote) {
    notFound();
  }

  const customer = quote.customers;
  const totalItems = quote.quote_items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild size="icon" variant="ghost">
          <Link href={`/org/${orgSlug}/listas-de-presupuestos`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-bold text-2xl">Presupuesto</h1>
          <p className="text-muted-foreground text-sm">
            {customer?.fantasy_name || customer?.business_name || "Cliente"} ·{" "}
            {formatDate(quote.created_at ?? "")}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Detalle */}
        <div className="space-y-4 md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Detalle del presupuesto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Cliente</p>
                  <p className="mt-0.5 font-medium">
                    {customer?.fantasy_name || customer?.business_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="mt-0.5 font-semibold text-lg">
                    {formatCurrency(quote.total_amount, quote.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Moneda</p>
                  <p className="mt-0.5 font-medium">{quote.currency}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    Condición de pago
                  </p>
                  <p className="mt-0.5 font-medium">
                    {quote.payment_condition || "—"}
                  </p>
                </div>
              </div>

              {quote.observations && (
                <div>
                  <p className="text-muted-foreground text-xs">Observaciones</p>
                  <p className="mt-0.5 text-sm">{quote.observations}</p>
                </div>
              )}

              {/* Items */}
              <div>
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Productos ({totalItems} unidades)
                </p>
                <div className="space-y-2">
                  {quote.quote_items.map((item) => (
                    <div
                      className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                      key={item.id}
                    >
                      <span>{item.description || "Producto"}</span>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>x{item.quantity}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(item.subtotal, quote.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Panel de estado */}
        <div>
          <QuoteStatusManager orgSlug={orgSlug} quote={quote} />
        </div>
      </div>
    </div>
  );
}
