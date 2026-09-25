"use client";

import { PlusIcon } from "@phosphor-icons/react";
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
import { formatCurrency } from "@/lib/format";
import {
  createManualFiscalInvoiceAction,
  downloadManualFiscalInvoicePdfAction,
  emitManualFiscalInvoiceAction,
} from "@/modules/arca/actions/manual-fiscal-invoices.action";
import type { ManualFiscalInvoice } from "@/modules/arca/server/manual-fiscal-invoices.service";

type CustomerOption = {
  id: string;
  business_name: string;
  fantasy_name: string | null;
  email: string | null;
};
type Line = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  ivaRate: string;
};
const blankLine = (): Line => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "1",
  unitPrice: "",
  ivaRate: "21",
});

export function ManualFiscalInvoicesPanel({
  canIssue,
  customers,
  invoices,
  orgSlug,
}: {
  canIssue: boolean;
  customers: CustomerOption[];
  invoices: ManualFiscalInvoice[];
  orgSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [invoiceType, setInvoiceType] = useState<
    "FACTURA_A" | "FACTURA_B" | "FACTURA_C"
  >("FACTURA_B");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [exchangeRate, setExchangeRate] = useState("");
  const [message, setMessage] = useState("");
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const totals = useMemo(
    () =>
      lines.reduce(
        (result, line) => {
          const net =
            (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
          const tax = (net * (Number(line.ivaRate) || 0)) / 100;
          return { net: result.net + net, tax: result.tax + tax };
        },
        { net: 0, tax: 0 }
      ),
    [lines]
  );
  const reset = () => {
    setCustomerId("");
    setInvoiceType("FACTURA_B");
    setCurrency("ARS");
    setExchangeRate("");
    setMessage("");
    setEmailRecipients("");
    setEmailSubject("");
    setEmailBody("");
    setLines([blankLine()]);
  };
  const updateLine = (index: number, key: keyof Line, value: string) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [key]: value } : line))
    );
  const save = () =>
    startTransition(async () => {
      const result = await createManualFiscalInvoiceAction({
        orgSlug,
        customerId,
        issueDate: new Date().toISOString().slice(0, 10),
        invoiceType,
        currency,
        exchangeRate: exchangeRate ? Number(exchangeRate) : null,
        customMessage: message || null,
        emailRecipients: emailRecipients || null,
        emailSubject: emailSubject || null,
        emailBody: emailBody || null,
        items: lines.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          ivaRate: Number(line.ivaRate) as 0 | 10.5 | 21 | 27,
        })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Factura manual guardada como borrador");
      reset();
      setOpen(false);
    });
  const issue = (id: string) =>
    startTransition(async () => {
      const result = await emitManualFiscalInvoiceAction({
        orgSlug,
        invoiceId: id,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Factura autorizada por ARCA");
      if (result.emailWarning) {
        toast.warning(result.emailWarning);
      }
    });
  const downloadPdf = (id: string) =>
    startTransition(async () => {
      const result = await downloadManualFiscalInvoicePdfAction({
        orgSlug,
        invoiceId: id,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const binary = window.atob(result.pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canIssue && (
          <Button onClick={() => setOpen(true)}>
            <PlusIcon className="size-4" weight="bold" />
            Nueva factura manual
          </Button>
        )}
      </div>
      {invoices.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-muted-foreground">
          No hay facturas manuales.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Factura</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Fecha</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr className="border-t" key={invoice.id}>
                  <td className="p-3 font-mono">
                    {invoice.invoice_number ?? "Borrador"}
                  </td>
                  <td className="p-3">
                    {invoice.customer?.fantasy_name ||
                      invoice.customer?.business_name ||
                      "Cliente"}
                  </td>
                  <td className="p-3 capitalize">{invoice.status}</td>
                  <td className="p-3">{invoice.issue_date}</td>
                  <td className="p-3 text-right">
                    {formatCurrency(invoice.total_amount, invoice.currency)}
                  </td>
                  <td className="p-3 text-right">
                    {canIssue &&
                      (invoice.status === "draft" ||
                        invoice.status === "error") && (
                        <Button
                          disabled={pending}
                          onClick={() => issue(invoice.id)}
                          size="sm"
                        >
                          Emitir ARCA
                        </Button>
                      )}
                    {invoice.status === "authorized" && (
                      <Button
                        disabled={pending}
                        onClick={() => downloadPdf(invoice.id)}
                        size="sm"
                        variant="outline"
                      >
                        PDF
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Factura manual</DialogTitle>
            <DialogDescription>
              Servicio, comisión u otro concepto sin afectar ventas ni stock.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Cliente</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                  onChange={(e) => setCustomerId(e.target.value)}
                  value={customerId}
                >
                  <option value="">Seleccionar</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.fantasy_name || customer.business_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Tipo</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                  onChange={(e) =>
                    setInvoiceType(e.target.value as typeof invoiceType)
                  }
                  value={invoiceType}
                >
                  <option value="FACTURA_A">Factura A</option>
                  <option value="FACTURA_B">Factura B</option>
                  <option value="FACTURA_C">Factura C</option>
                </select>
              </div>
              <div>
                <Label>Moneda</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                  onChange={(e) =>
                    setCurrency(e.target.value as typeof currency)
                  }
                  value={currency}
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            {currency === "USD" && (
              <div>
                <Label>Tipo de cambio comercial USD → ARS</Label>
                <Input
                  min="0"
                  onChange={(e) => setExchangeRate(e.target.value)}
                  step="any"
                  type="number"
                  value={exchangeRate}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Renglones</Label>
              {lines.map((line, index) => (
                <div
                  className="grid grid-cols-[1fr_80px_120px_90px_auto] gap-2"
                  key={line.id}
                >
                  <Input
                    onChange={(e) =>
                      updateLine(index, "description", e.target.value)
                    }
                    placeholder="Descripción del servicio"
                    value={line.description}
                  />
                  <Input
                    onChange={(e) =>
                      updateLine(index, "quantity", e.target.value)
                    }
                    placeholder="Cant."
                    type="number"
                    value={line.quantity}
                  />
                  <Input
                    onChange={(e) =>
                      updateLine(index, "unitPrice", e.target.value)
                    }
                    placeholder="Precio"
                    type="number"
                    value={line.unitPrice}
                  />
                  <select
                    className="rounded-md border bg-background px-2"
                    onChange={(e) =>
                      updateLine(index, "ivaRate", e.target.value)
                    }
                    value={line.ivaRate}
                  >
                    <option value="0">IVA 0%</option>
                    <option value="10.5">IVA 10,5%</option>
                    <option value="21">IVA 21%</option>
                    <option value="27">IVA 27%</option>
                  </select>
                  <Button
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((_, i) => i !== index)
                      )
                    }
                    type="button"
                    variant="ghost"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                onClick={() => setLines((current) => [...current, blankLine()])}
                size="sm"
                type="button"
                variant="outline"
              >
                Agregar renglón
              </Button>
            </div>
            <p className="text-right font-medium">
              Neto {formatCurrency(totals.net, currency)} · IVA{" "}
              {formatCurrency(totals.tax, currency)} · Total{" "}
              {formatCurrency(totals.net + totals.tax, currency)}
            </p>
            <div>
              <Label>Leyenda en PDF</Label>
              <Textarea
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Mensaje u observación personalizada"
                value={message}
              />
            </div>
            <div className="grid gap-3">
              <Label>Mensaje de email</Label>
              <Input
                onChange={(e) => setEmailRecipients(e.target.value)}
                placeholder="Destinatarios separados por coma"
                value={emailRecipients}
              />
              <Input
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Asunto"
                value={emailSubject}
              />
              <Textarea
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Cuerpo del email"
                value={emailBody}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={pending || !customerId} onClick={save}>
                Guardar borrador
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
