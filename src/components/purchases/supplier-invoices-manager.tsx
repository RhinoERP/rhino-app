"use client";

import { FilePdfIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AsientoModal } from "@/components/accounting/asiento-modal";
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
import {
  buildFacturaCompra,
  confirmAccountingEvent,
  previewAccountingEvent,
} from "@/lib/accounting-client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { EventoFacturaCompra } from "@/modules/accounting/types";
import { getDocumentSignedUrlAction } from "@/modules/documents/actions/get-document-signed-url.action";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import { createSupplierInvoiceAction } from "@/modules/purchases/actions/create-supplier-invoice.action";
import { setSupplierInvoiceOrdersAction } from "@/modules/purchases/actions/set-supplier-invoice-orders.action";
import {
  SUPPLIER_INVOICE_TYPES,
  type SupplierInvoice,
  type SupplierInvoicePurchaseOrderOption,
  type SupplierInvoiceWithRelations,
} from "@/modules/purchases/supplier-invoices.types";
import { validateSupplierInvoicePdf } from "@/modules/purchases/utils/supplier-invoice-pdf";
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

function InvoiceOrderSelection({
  orders,
  selected,
  onChange,
  disabled = false,
}: {
  orders: {
    id: string;
    purchase_number: number | null;
    total_amount?: number;
    currency?: string;
    purchase_date?: string;
  }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="font-medium text-sm">
        Órdenes de compra (opcional)
      </legend>
      <p className="text-muted-foreground text-xs">
        Podés registrar la factura sin asociar órdenes de compra. La selección
        no reparte el importe.
      </p>
      {orders.length ? (
        <div className="max-h-48 overflow-y-auto rounded-md border p-2">
          {orders.map((order) => (
            <label
              className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-muted"
              key={order.id}
            >
              <input
                checked={selected.includes(order.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, order.id]
                      : selected.filter((id) => id !== order.id)
                  )
                }
                type="checkbox"
              />
              <span className="text-sm">
                OC-
                {String(order.purchase_number ?? order.id.slice(0, 8)).padStart(
                  4,
                  "0"
                )}
                {order.purchase_date && ` · ${formatDate(order.purchase_date)}`}
                {order.total_amount !== undefined &&
                  ` · ${formatCurrency(order.total_amount, order.currency)}`}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Este proveedor no tiene OC disponibles.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {selected.length} OC seleccionadas
        </span>
        {selected.length > 0 && (
          <Button
            onClick={() => onChange([])}
            size="sm"
            type="button"
            variant="ghost"
          >
            Limpiar selección de OC
          </Button>
        )}
      </div>
    </fieldset>
  );
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

      <SupplierInvoicesTable
        invoices={invoices}
        orgSlug={orgSlug}
        purchaseOrders={purchaseOrders}
      />

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

function formatInvoiceOrders(invoice: SupplierInvoiceWithRelations): string {
  if (invoice.purchase_orders?.length) {
    return invoice.purchase_orders
      .map(
        (order) =>
          `OC-${String(order.purchase_number ?? order.id.slice(0, 8)).padStart(4, "0")}`
      )
      .join(", ");
  }
  if (invoice.purchase_order?.purchase_number != null) {
    return `OC-${String(invoice.purchase_order.purchase_number).padStart(4, "0")}`;
  }
  return "Sin OC";
}

function SupplierInvoicesTable({
  invoices,
  orgSlug,
  purchaseOrders,
}: {
  invoices: SupplierInvoiceWithRelations[];
  orgSlug: string;
  purchaseOrders: SupplierInvoicePurchaseOrderOption[];
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
            <th className="px-4 py-3 font-medium">Órdenes de compra</th>
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
                {formatInvoiceOrders(invoice)}
                {invoice.payable_model === "INVOICE" && (
                  <InvoiceOrderEditor
                    invoice={invoice}
                    orgSlug={orgSlug}
                    purchaseOrders={purchaseOrders}
                  />
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatCurrency(invoice.total_amount, invoice.currency)}
              </td>
              <td className="px-4 py-3 text-center">
                {invoice.invoice_pdf_url ? (
                  <SupplierInvoicePreviewButton
                    filename={invoice.invoice_filename}
                    reference={invoice.invoice_pdf_url}
                  />
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

function InvoiceOrderEditor({
  invoice,
  orgSlug,
  purchaseOrders,
}: {
  invoice: SupplierInvoiceWithRelations;
  orgSlug: string;
  purchaseOrders: SupplierInvoicePurchaseOrderOption[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const availableOrders = purchaseOrders.filter(
    (order) =>
      order.supplier_id === invoice.supplier_id &&
      order.status !== "DRAFT" &&
      order.status !== "CANCELLED"
  );
  const existingOnlyOrders = (invoice.purchase_orders ?? []).filter(
    (order) => !availableOrders.some((available) => available.id === order.id)
  );
  return (
    <>
      <Button
        onClick={() => {
          setSelected(invoice.purchase_orders?.map((order) => order.id) ?? []);
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        Vincular OC
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>OC de la factura {invoice.invoice_number}</DialogTitle>
            <DialogDescription>
              Solo cambia la trazabilidad. La deuda, sus pagos y el asiento
              contable se conservan.
            </DialogDescription>
          </DialogHeader>
          <InvoiceOrderSelection
            disabled={pending}
            onChange={setSelected}
            orders={[...existingOnlyOrders, ...availableOrders]}
            selected={selected}
          />
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setSupplierInvoiceOrdersAction({
                  orgSlug,
                  invoiceId: invoice.id,
                  purchaseOrderIds: selected,
                });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Vínculos actualizados; deuda sin cambios");
                setOpen(false);
              })
            }
          >
            {pending ? "Guardando..." : "Guardar vínculos"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SupplierInvoicePreviewButton({
  filename,
  reference,
}: {
  filename: string | null;
  reference: string;
}) {
  async function handleOpen() {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      toast.error(
        "No se pudo abrir la vista previa. Habilitá las ventanas emergentes."
      );
      return;
    }

    previewWindow.opener = null;

    try {
      const result = await getDocumentSignedUrlAction(reference);
      if (!result.success) {
        previewWindow.close();
        toast.error(result.error);
        return;
      }

      previewWindow.location.href = result.url;
    } catch {
      previewWindow.close();
      toast.error("No se pudo abrir el comprobante PDF");
    }
  }

  return (
    <Button
      onClick={handleOpen}
      size="icon-sm"
      title={filename ?? "Abrir PDF"}
      type="button"
      variant="ghost"
    >
      <FilePdfIcon className="size-4" />
      <span className="sr-only">Abrir comprobante PDF</span>
    </Button>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: invoice form supports legacy/direct debt, attachments and a separate accounting step.
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
  const [purchaseOrderIds, setPurchaseOrderIds] = useState<string[]>([]);
  const [invoiceCurrency, setInvoiceCurrency] = useState("ARS");
  const [subtotalAmount, setSubtotalAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [exchangeRate, setExchangeRate] = useState("");
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredInvoiceId, setRegisteredInvoiceId] = useState<string | null>(
    null
  );
  const [accountingPayload, setAccountingPayload] =
    useState<EventoFacturaCompra | null>(null);

  const { data: orgSettings } = useOrgSettings(orgSlug);
  const directInvoiceEnabled =
    orgSettings?.invoice_backed_debt_enabled ?? false;
  const accountingIntegrationEnabled =
    orgSettings?.accounting_integration_enabled ?? false;
  const automaticAccountingEnabled =
    orgSettings?.automatic_accounting_enabled ?? false;

  const supplierPurchaseOrders = useMemo(
    () =>
      purchaseOrders.filter(
        (purchaseOrder) =>
          (!supplierId || purchaseOrder.supplier_id === supplierId) &&
          purchaseOrder.status !== "DRAFT" &&
          purchaseOrder.status !== "CANCELLED"
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

  const selectedPurchaseOrderCurrency = useMemo(
    () =>
      purchaseOrders.find(
        (purchaseOrder) => purchaseOrder.id === purchaseOrderId
      )?.currency ?? "ARS",
    [purchaseOrders, purchaseOrderId]
  );
  const effectiveCurrency = directInvoiceEnabled
    ? invoiceCurrency
    : selectedPurchaseOrderCurrency;
  const isUsdPurchaseOrder = effectiveCurrency === "USD";

  const equivalenteARS = useMemo(() => {
    const parsedRate = Number(exchangeRate);
    if (!isUsdPurchaseOrder) {
      return null;
    }
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      return null;
    }
    return ((Number.parseFloat(totalAmount) || 0) * parsedRate).toFixed(2);
  }, [exchangeRate, isUsdPurchaseOrder, totalAmount]);

  useEffect(() => {
    if (!(isUsdPurchaseOrder && open) || exchangeRate) {
      return;
    }
    let cancelled = false;
    fetch("/api/exchange-rate/usd")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled && data?.venta) {
          setExchangeRate(String(data.venta));
        }
      })
      .catch(() => {
        // si no se puede obtener la cotización, el usuario la escribe
      });
    return () => {
      cancelled = true;
    };
  }, [isUsdPurchaseOrder, open, exchangeRate]);

  function selectPurchaseOrder(value: string) {
    setPurchaseOrderId(value);
    const purchaseOrder = purchaseOrders.find((item) => item.id === value);
    if (purchaseOrder?.supplier_id) {
      setSupplierId(purchaseOrder.supplier_id);
    }
  }

  function reset() {
    setFormError(null);
    setRegisteredInvoiceId(null);
    setSupplierId("");
    setPurchaseOrderId("");
    setPurchaseOrderIds([]);
    setInvoiceCurrency("ARS");
    setSubtotalAmount("0");
    setTaxAmount("0");
    setExchangeRate("");
  }

  async function tryAutoAccounting(
    payload: EventoFacturaCompra
  ): Promise<boolean> {
    try {
      const preview = await previewAccountingEvent(payload);
      if (preview.estadoImputacion === "COMPLETO") {
        await confirmAccountingEvent(payload);
        return true;
      }
    } catch (autoError) {
      console.error(
        "No se pudo automatizar el asiento de factura proveedor, abriendo revisión manual",
        autoError
      );
    }
    return false;
  }

  function buildInvoiceAccountingPayload(
    invoice: NonNullable<
      Extract<
        Awaited<ReturnType<typeof createSupplierInvoiceAction>>,
        { success: true }
      >["invoice"]
    >
  ): EventoFacturaCompra {
    return buildFacturaCompra(
      {
        id: invoice.id,
        organization_id: invoice.organization_id,
        supplier_id: invoice.supplier_id,
        purchase_date: invoice.invoice_date,
        expiration_date: invoice.due_date,
        subtotal_amount: invoice.subtotal_amount,
        tax_amount: invoice.tax_amount,
        total_amount: invoice.total_amount,
        remittance_number: [
          invoice.invoice_type,
          invoice.point_of_sale,
          invoice.invoice_number,
        ]
          .filter(Boolean)
          .join("-"),
        taxes: null,
      },
      {
        moneda: invoice.currency === "USD" ? "USD" : "ARS",
        tipoCambio: invoice.exchange_rate,
        montoUSD: invoice.currency === "USD" ? invoice.total_amount : undefined,
      },
      {
        referenciaTabla: "supplier_invoices",
        idempotencyKey: `FACTURA_COMPRA_SI_${invoice.id}`,
      }
    );
  }

  async function finishInvoiceRegistration(invoice: SupplierInvoice) {
    if (accountingIntegrationEnabled && invoice.supplier_id) {
      const payload = buildInvoiceAccountingPayload(invoice);
      if (!(automaticAccountingEnabled && (await tryAutoAccounting(payload)))) {
        setAccountingPayload(payload);
        return;
      }
    }
    toast.success("Factura de proveedor registrada");
    reset();
    onOpenChange(false);
  }

  function submit(formData: FormData) {
    if (registeredInvoiceId) {
      return;
    }
    const file = formData.get("file");
    const fileError = validateSupplierInvoicePdf(
      file instanceof File ? file : null
    );
    setFormError(fileError);
    if (fileError) {
      return;
    }
    startTransition(async () => {
      let committedId: string | null = null;
      try {
        const result = await createSupplierInvoiceAction(formData);
        if (!result.success) {
          setFormError(result.error);
          toast.error(result.error);
          return;
        }
        const { invoice } = result;
        committedId = invoice.id;
        setRegisteredInvoiceId(invoice.id);
        await finishInvoiceRegistration(invoice);
      } catch (error) {
        console.error("Falló el envío de factura de proveedor", error);
        setFormError(
          committedId
            ? `La factura ${committedId} quedó registrada, pero no se pudo completar el paso contable. No vuelvas a cargarla; revisá su contabilidad.`
            : "No se pudo confirmar el registro. Se conservaron los datos. Revisá el listado de facturas antes de reintentar para evitar duplicados."
        );
      }
    });
  }

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open && !accountingPayload}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar factura de proveedor</DialogTitle>
            <DialogDescription>
              {directInvoiceEnabled
                ? "Cada factura genera una cuenta por pagar. Las órdenes vinculadas son trazabilidad: no reparten importes ni modifican la recepción."
                : "La factura actualiza la deuda consolidada de su orden de compra sin modificar la recepción de mercadería."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit(new FormData(event.currentTarget));
            }}
          >
            <input name="orgSlug" type="hidden" value={orgSlug} />
            <input name="totalAmount" type="hidden" value={totalAmount} />
            <input name="currency" type="hidden" value={effectiveCurrency} />
            {directInvoiceEnabled &&
              purchaseOrderIds.map((id) => (
                <input
                  key={id}
                  name="purchaseOrderIds"
                  type="hidden"
                  value={id}
                />
              ))}

            <div className="grid gap-4">
              {!directInvoiceEnabled && (
                <div className="order-2 space-y-2">
                  <Label htmlFor="purchaseOrderId">
                    Órdenes de compra (opcional)
                  </Label>
                  <select
                    className="min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    id="purchaseOrderId"
                    name="purchaseOrderId"
                    onChange={(event) =>
                      selectPurchaseOrder(event.target.value)
                    }
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
                        ·{" "}
                        {formatCurrency(
                          purchaseOrder.total_amount,
                          purchaseOrder.currency
                        )}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="order-1 space-y-2">
                <Label htmlFor="supplierId">Proveedor</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  id="supplierId"
                  name="supplierId"
                  onChange={(event) => {
                    setSupplierId(event.target.value);
                    setPurchaseOrderId("");
                    setPurchaseOrderIds([]);
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

            {directInvoiceEnabled &&
              (supplierId ? (
                <InvoiceOrderSelection
                  disabled={isPending || !!registeredInvoiceId}
                  onChange={setPurchaseOrderIds}
                  orders={supplierPurchaseOrders}
                  selected={purchaseOrderIds}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Elegí un proveedor para ver sus órdenes de compra. Asociarlas
                  es opcional.
                </p>
              ))}

            {directInvoiceEnabled && (
              <div className="space-y-2">
                <Label htmlFor="invoiceCurrency">Moneda de la factura</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  id="invoiceCurrency"
                  onChange={(event) => {
                    setInvoiceCurrency(event.target.value);
                    setExchangeRate("");
                  }}
                  value={invoiceCurrency}
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                <p className="text-muted-foreground text-xs">
                  Puede ser distinta de la moneda de costo de las OC.
                </p>
              </div>
            )}

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

            {isUsdPurchaseOrder && (
              <div className="space-y-2">
                <Label htmlFor="exchangeRate">Tipo de cambio (USD→ARS)</Label>
                <Input
                  id="exchangeRate"
                  name="exchangeRate"
                  onChange={(event) => setExchangeRate(event.target.value)}
                  placeholder="Ej. 1240.50"
                  required
                  step="any"
                  type="number"
                  value={exchangeRate}
                />
                {equivalenteARS && (
                  <p className="text-muted-foreground text-xs">
                    Equivalente en ARS: {formatCurrency(Number(equivalenteARS))}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="file">Comprobante PDF</Label>
              <Input
                accept="application/pdf"
                id="file"
                name="file"
                onChange={(event) =>
                  setFormError(
                    validateSupplierInvoicePdf(event.target.files?.[0] ?? null)
                  )
                }
                type="file"
              />
              <p className="text-muted-foreground text-xs">
                Opcional. Solo PDF, máximo 10 MiB (10.485.760 bytes).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Observaciones opcionales"
              />
            </div>

            {formError && (
              <p className="text-destructive text-sm" role="alert">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                disabled={isPending}
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                type="button"
                variant="outline"
              >
                {registeredInvoiceId ? "Cerrar" : "Cancelar"}
              </Button>
              <Button
                disabled={isPending || !!registeredInvoiceId}
                type="submit"
              >
                {isPending ? "Guardando..." : "Registrar factura"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {accountingPayload && (
        <AsientoModal
          eventoPayload={accountingPayload}
          mode="gate"
          onCancel={() => {
            setAccountingPayload(null);
            setFormError(
              "La factura ya quedó registrada. La revisión contable quedó pendiente; no vuelvas a cargar el comprobante."
            );
          }}
          onConfirm={() => {
            toast.success("Factura de proveedor registrada");
            setAccountingPayload(null);
            reset();
            onOpenChange(false);
          }}
          open
          persistAs="formal"
        />
      )}
    </>
  );
}
