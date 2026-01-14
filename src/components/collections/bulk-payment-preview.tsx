import { format } from "date-fns";
import { Loader2Icon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { BulkPaymentDistribution } from "@/modules/collections/types";

type BulkPaymentPreviewProps = {
  preview: BulkPaymentDistribution[] | undefined;
  isLoading: boolean;
  totalAmount: number;
};

function PreviewItem({
  dist,
  index,
}: {
  dist: BulkPaymentDistribution;
  index: number;
}) {
  return (
    <div className="space-y-1 rounded-md border p-3" key={dist.accountId}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          {index + 1}.{" "}
          {dist.invoiceNumber ||
            (dist.saleNumber ? `Venta #${dist.saleNumber}` : "Sin factura")}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-xs",
            dist.newStatus === "PAID"
              ? "bg-green-100 text-green-800"
              : "bg-yellow-100 text-yellow-800"
          )}
        >
          {dist.newStatus === "PAID" ? "PAGADO" : "PARCIAL"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-muted-foreground text-xs">
        <div>Vencimiento: {format(new Date(dist.dueDate), "dd/MM/yyyy")}</div>
        <div>Total: ${dist.totalAmount.toFixed(2)}</div>
        <div>Saldo anterior: ${dist.pendingBalance.toFixed(2)}</div>
        <div className="font-semibold text-green-600">
          Aplicado: ${dist.appliedAmount.toFixed(2)}
        </div>
        <div>Nuevo saldo: ${dist.newBalance.toFixed(2)}</div>
      </div>
    </div>
  );
}

function PreviewSummary({
  totalAmount,
  appliedAmount,
  creditBalance,
  previewLength,
}: {
  totalAmount: number;
  appliedAmount: number;
  creditBalance: number;
  previewLength: number;
}) {
  return (
    <>
      <Separator className="my-4" />
      <div className="space-y-2 rounded-lg bg-muted p-4">
        <div className="flex justify-between text-sm">
          <span>Monto Total Recibido:</span>
          <span className="font-semibold">${totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Monto Aplicado:</span>
          <span className="font-semibold text-green-600">
            ${appliedAmount.toFixed(2)}
          </span>
        </div>
        {creditBalance > 0 && (
          <div className="flex justify-between text-sm">
            <span>Saldo a Favor del Cliente:</span>
            <span className="font-semibold text-blue-600">
              ${creditBalance.toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Facturas Afectadas:</span>
          <span>{previewLength}</span>
        </div>
      </div>
      {creditBalance > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-blue-800 text-sm">
            ℹ️ El saldo a favor quedará registrado y podrá utilizarse en futuras
            ventas.
          </p>
        </div>
      )}
    </>
  );
}

export function BulkPaymentPreview({
  preview,
  isLoading,
  totalAmount,
}: BulkPaymentPreviewProps) {
  const appliedAmount =
    preview?.reduce((sum, dist) => sum + dist.appliedAmount, 0) ?? 0;
  const creditBalance = totalAmount - appliedAmount;

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2Icon className="size-6 animate-spin" />
      </div>
    );
  }

  if (!preview || preview.length === 0) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800">
          No hay facturas pendientes para este cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {preview.map((dist, index) => (
        <PreviewItem dist={dist} index={index} key={dist.accountId} />
      ))}
      <PreviewSummary
        appliedAmount={appliedAmount}
        creditBalance={creditBalance}
        previewLength={preview.length}
        totalAmount={totalAmount}
      />
    </div>
  );
}
