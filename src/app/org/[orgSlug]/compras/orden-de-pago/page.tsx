import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentOrderForm } from "@/components/payment-orders/payment-order-form";
import { Button } from "@/components/ui/button";
import { getPendingInvoicesBySupplier } from "@/modules/payment-orders/actions/get-pending-invoices.action";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ supplier_id?: string }>;
};

export default async function OrdenDePagoPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const { supplier_id } = await searchParams;

  const suppliers = await getPendingInvoicesBySupplier(orgSlug);

  if (!suppliers.length) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/org/${orgSlug}/compras`}>
            <Button size="sm" variant="ghost" className="gap-2">
              <ArrowLeftIcon className="size-4" />
              Volver a compras
            </Button>
          </Link>
        </div>
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">No hay facturas pendientes de pago</p>
          <p className="text-sm mt-1">
            Cuando recibas facturas de proveedores, aparecerán acá para cancelar.
          </p>
        </div>
      </div>
    );
  }

  // Si viene supplier_id por querystring, lo usamos directo
  const selectedSupplier = supplier_id
    ? suppliers.find((s) => s.id === supplier_id)
    : suppliers[0];

  if (!selectedSupplier) notFound();

  const currencyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/org/${orgSlug}/compras`}>
            <Button size="sm" variant="ghost" className="gap-2">
              <ArrowLeftIcon className="size-4" />
              Volver a compras
            </Button>
          </Link>
          <div>
            <h1 className="font-bold text-2xl">Nueva Orden de Pago</h1>
            <p className="text-muted-foreground text-sm">
              El asiento debe cerrar en $0 para confirmar el pago.
            </p>
          </div>
        </div>
      </div>

      {/* Selector de proveedor si hay varios */}
      {suppliers.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {suppliers.map((s) => (
            <Link
              key={s.id}
              href={`/org/${orgSlug}/compras/orden-de-pago?supplier_id=${s.id}`}
            >
              <Button
                variant={s.id === selectedSupplier.id ? "default" : "outline"}
                size="sm"
                className="gap-2"
              >
                {s.name}
                <span className="font-mono text-xs opacity-70">
                  {currencyFormatter.format(s.totalPending)}
                </span>
              </Button>
            </Link>
          ))}
        </div>
      )}

      {/* Formulario principal */}
      <PaymentOrderForm
        orgSlug={orgSlug}
        supplierId={selectedSupplier.id}
        supplierName={selectedSupplier.name}
        pendingInvoices={selectedSupplier.pendingInvoices.map((inv) => ({
          purchase_order_id: inv.purchase_order_id,
          purchase_number: inv.purchase_number,
          total_amount: inv.pending_balance, // usamos el saldo pendiente real
        }))}
      />
    </div>
  );
}
