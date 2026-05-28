import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentOrderForm } from "@/components/payment-orders/payment-order-form";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { requireAuth } from "@/lib/supabase/auth";
import { getPendingInvoicesBySupplierAction } from "@/modules/payment-orders/actions/get-pending-invoices.action";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ supplier_id?: string }>;
};

export default async function OrdenDePagoPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const { supplier_id } = await searchParams;

  await requireAuth();

  const suppliers = await getPendingInvoicesBySupplierAction(orgSlug);

  if (!suppliers.length) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/org/${orgSlug}/compras`}>
            <Button className="gap-2" size="sm" variant="ghost">
              <ArrowLeftIcon className="size-4" />
              Volver a compras
            </Button>
          </Link>
        </div>
        <div className="py-16 text-center text-muted-foreground">
          <p className="font-medium">No hay facturas pendientes de pago</p>
          <p className="mt-1 text-sm">
            Cuando recibas facturas de proveedores, aparecerán acá para
            cancelar.
          </p>
        </div>
      </div>
    );
  }

  // Si viene supplier_id por querystring, lo usamos directo
  const selectedSupplier = supplier_id
    ? suppliers.find((s) => s.id === supplier_id)
    : suppliers[0];

  if (!selectedSupplier) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/org/${orgSlug}/compras`}>
            <Button className="gap-2" size="sm" variant="ghost">
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
              href={`/org/${orgSlug}/compras/orden-de-pago?supplier_id=${s.id}`}
              key={s.id}
            >
              <Button
                className="gap-2"
                size="sm"
                variant={s.id === selectedSupplier.id ? "default" : "outline"}
              >
                {s.name}
                <span className="font-mono text-xs opacity-70">
                  {formatCurrency(s.totalPending)}
                </span>
              </Button>
            </Link>
          ))}
        </div>
      )}

      {/* Formulario principal */}
      <PaymentOrderForm
        orgSlug={orgSlug}
        pendingInvoices={selectedSupplier.pendingInvoices.map((inv) => ({
          purchase_order_id: inv.purchase_order_id,
          purchase_number: inv.purchase_number,
          total_amount: inv.pending_balance, // usamos el saldo pendiente real
        }))}
        supplierId={selectedSupplier.id}
        supplierName={selectedSupplier.name}
      />
    </div>
  );
}
