"use client";

import { FilePdfIcon, PlusIcon } from "@phosphor-icons/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import { createSupplierInvoiceAction } from "@/modules/purchases/actions/create-supplier-invoice.action";
import {
  SUPPLIER_INVOICE_TYPES,
  type SupplierInvoicePurchaseOrderOption,
  type SupplierInvoiceWithRelations,
} from "@/modules/purchases/supplier-invoices.types";
import type { Supplier } from "@/modules/suppliers/types";

type SupplierInvoicesManagerProps = {
  invoices: SupplierInvoiceWithRelations[];
  orgSlug: string;
  purchaseOrders: SupplierInvoicePurchaseOrderOption[];
  suppliers: Supplier[];
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SupplierInvoicesManager({
  invoices,
  orgSlug,
  purchaseOrders,
  suppliers,
}: SupplierInvoicesManagerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Facturas de proveedor</h1>
          <p className="text-muted-foreground text-sm">
            Registrá los comprobantes que recibís y vinculalos a sus órdenes de
            compra.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <PlusIcon className="size-4" weight="bold" />
          Registrar factura
        </Button>
      </div>

      <SupplierInvoicesTable invoices={invoices} />

      <SupplierInvoiceDialog
        onOpenChange={setOpen}
        open={open}
        orgSlug={orgSlug}
        purchaseOrders={purchaseOrders}
        suppliers={suppliers}
      />
    </>
  );
}

function SupplierInvoicesTable({
  invoices,
}: {
  invoices: SupplierInvoiceWithRelations[];
}) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-14 text-center">
        <p className="font-medium">Todavía no hay facturas de proveedor.</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Registrá la factura cuando el proveedor entregue el comprobante.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Proveedor</th>
            <th className="px-4 py-3 font-medium">Comprobante</th>
            <th className="px-4 py-3 font-medium">Orden de compra</th>
            <th className="px-4 py-3 text-right font-medium">Total</th>
            <th className="px-4 py-3 text-center font-medium">PDF</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr className="border-b last:border-0" key={invoice.id}>
              <td className="px-4 py-3">
                {formatDate(invoice.invoice_date, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-3 font-medium">
                {invoice.supplier?.name ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono">
                {[
                  invoice.invoice_type,
                  invoice.point_of_sale,
                  invoice.invoice_number,
                ]
                  .filter(Boolean)
                  .join("-")}
              </td>
              <td className="px-4 py-3 font-mono">
                {invoice.purchase_order?.purchase_number !== null &&
                invoice.purchase_order?.purchase_number !== undefined
                  ? `OC-${String(invoice.purchase_order.purchase_number).padStart(4, "0")}`
                  : "Sin OC"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatCurrency(invoice.total_amount, invoice.currency)}
              </td>
              <td className="px-4 py-3 text-center">
                {invoice.invoice_pdf_url ? (
                  <Button
                    asChild
                    size="icon-sm"
                    title={invoice.invoice_filename ?? "Abrir PDF"}
                    variant="ghost"
                  >
                    <a
                      href={invoice.invoice_pdf_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <FilePdfIcon className="size-4" />
                      <span className="sr-only">Abrir comprobante PDF</span>
                    </a>
                  </Button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupplierInvoiceDialog({
  onOpenChange,
  open,
  orgSlug,
  purchaseOrders,
  suppliers,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  orgSlug: string;
  purchaseOrders: SupplierInvoicePurchaseOrderOption[];
  suppliers: Supplier[];
}) {
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [subtotalAmount, setSubtotalAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [isPending, startTransition] = useTransition();

  const supplierPurchaseOrders = useMemo(
    () =>
      purchaseOrders.filter(
        (purchaseOrder) =>
          !supplierId || purchaseOrder.supplier_id === supplierId
      ),
    [purchaseOrders, supplierId]
  );
  const totalAmount = useMemo(
    () =>
      (
        (Number.parseFloat(subtotalAmount) || 0) +
        (Number.parseFloat(taxAmount) || 0)
      ).toFixed(2),
    [subtotalAmount, taxAmount]
  );

  function selectPurchaseOrder(value: string) {
    setPurchaseOrderId(value);
    const purchaseOrder = purchaseOrders.find((item) => item.id === value);
    if (purchaseOrder?.supplier_id) {
      setSupplierId(purchaseOrder.supplier_id);
    }
  }

  function reset() {
    setSupplierId("");
    setPurchaseOrderId("");
    setSubtotalAmount("0");
    setTaxAmount("0");
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createSupplierInvoiceAction(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Factura de proveedor registrada");
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar factura de proveedor</DialogTitle>
          <DialogDescription>
            El comprobante queda asociado a la orden de compra, sin modificar la
            recepción de mercadería.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="grid gap-4">
          <input name="orgSlug" type="hidden" value={orgSlug} />
          <input name="totalAmount" type="hidden" value={totalAmount} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="purchaseOrderId">Orden de compra</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                id="purchaseOrderId"
                name="purchaseOrderId"
                onChange={(event) => selectPurchaseOrder(event.target.value)}
                value={purchaseOrderId}
              >
                <option value="">Sin vincular a una OC</option>
                {supplierPurchaseOrders.map((purchaseOrder) => (
                  <option key={purchaseOrder.id} value={purchaseOrder.id}>
                    OC-
                    {String(purchaseOrder.purchase_number ?? 0).padStart(
                      4,
                      "0"
                    )}{" "}
                    · {formatCurrency(purchaseOrder.total_amount)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierId">Proveedor</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                id="supplierId"
                name="supplierId"
                onChange={(event) => {
                  setSupplierId(event.target.value);
                  setPurchaseOrderId("");
                }}
                required
                value={supplierId}
              >
                <option value="">Seleccionar proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="invoiceType">Tipo</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="A"
                id="invoiceType"
                name="invoiceType"
              >
                {SUPPLIER_INVOICE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pointOfSale">Punto de venta</Label>
              <Input
                id="pointOfSale"
                maxLength={20}
                name="pointOfSale"
                placeholder="0001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Número</Label>
              <Input
                id="invoiceNumber"
                maxLength={100}
                name="invoiceNumber"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Fecha de emisión</Label>
              <Input
                defaultValue={today()}
                id="invoiceDate"
                name="invoiceDate"
                required
                type="date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Vencimiento</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="subtotalAmount">Neto gravado</Label>
              <Input
                id="subtotalAmount"
                min="0"
                name="subtotalAmount"
                onChange={(event) => setSubtotalAmount(event.target.value)}
                required
                step="0.01"
                type="number"
                value={subtotalAmount}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxAmount">Impuestos</Label>
              <Input
                id="taxAmount"
                min="0"
                name="taxAmount"
                onChange={(event) => setTaxAmount(event.target.value)}
                required
                step="0.01"
                type="number"
                value={taxAmount}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalPreview">Total</Label>
              <Input disabled id="totalPreview" value={totalAmount} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Comprobante PDF</Label>
            <Input accept="application/pdf" id="file" name="file" type="file" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Observaciones opcionales"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "Guardando..." : "Registrar factura"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
