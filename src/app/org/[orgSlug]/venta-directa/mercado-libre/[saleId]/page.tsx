import Link from "next/link";
import { notFound } from "next/navigation";
import { MeliCreditNotes } from "@/components/mercadolibre/meli-credit-notes";
import { MeliInvoiceActions } from "@/components/mercadolibre/meli-invoice-actions";
import { MeliPhysicalReturns } from "@/components/mercadolibre/meli-physical-returns";
import { MeliReceiverCorrection } from "@/components/mercadolibre/meli-receiver-correction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { hasMeliPaymentsAccess } from "@/modules/mercadolibre/permissions";
import { listMeliCreditNotes } from "@/modules/mercadolibre/service/meli-credit-note-read.service";
import { getMeliPaymentSale } from "@/modules/mercadolibre/service/meli-payments.service";
import { listMeliPhysicalReturns } from "@/modules/mercadolibre/service/meli-physical-return.service";
import { getMeliSale } from "@/modules/mercadolibre/service/meli-read.service";
import { getMeliFiscalStatusLabel } from "@/modules/mercadolibre/utils/fiscal-status";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import { getInvoiceTypeLabel } from "@/modules/sales/invoice-type-utils";

export default async function MeliSalePage({
  params,
}: {
  params: Promise<{ orgSlug: string; saleId: string }>;
}) {
  const { orgSlug, saleId } = await params;
  const sale = await getMeliSale(orgSlug, saleId);
  if (!sale) {
    notFound();
  }
  const layout = await getOrganizationLayoutData(orgSlug);
  const canIssue =
    layout?.permissions.some(
      (permission) =>
        permission === "organization.admin" ||
        permission === "mercadolibre.invoice"
    ) === true;
  const receiver = sale.receiver;
  const [creditNotes, physicalReturns, paymentSale] = await Promise.all([
    listMeliCreditNotes(orgSlug, sale.id),
    listMeliPhysicalReturns(orgSlug, sale.id),
    hasMeliPaymentsAccess(layout?.permissions ?? [])
      ? getMeliPaymentSale(orgSlug, sale.id)
      : Promise.resolve(null),
  ]);
  const canManageReturns =
    layout?.permissions.some(
      (permission) =>
        permission === "organization.admin" ||
        permission === "mercadolibre.manage"
    ) === true;
  const canCreateCreditNote =
    canIssue &&
    layout?.permissions.some(
      (permission) =>
        permission === "organization.admin" ||
        permission === "mercadolibre.manage"
    ) === true;
  const buyerName =
    receiver.tax_condition === "RESPONSABLE_INSCRIPTO"
      ? receiver.business_name
      : `${receiver.first_name} ${receiver.last_name}`;
  return (
    <div className="space-y-5">
      <Link
        className="text-sm hover:underline"
        href={`/org/${orgSlug}/venta-directa/mercado-libre`}
      >
        ← Ventas Mercado Libre
      </Link>
      <h1 className="font-heading text-2xl">Venta Meli #{sale.sale_number}</h1>
      {sale.status === "CANCELLED" && (
        <p className="text-destructive text-sm">Esta venta está cancelada.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Operación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Orden Meli: <strong>{sale.marketplace_order_number}</strong>
            </p>
            <p>Fecha: {formatDateOnly(sale.sale_date)}</p>
            <p>Depósito: {sale.warehouseName}</p>
            <p>Comprobante: {getInvoiceTypeLabel(sale.invoice_type)}</p>
            <p>Estado fiscal: {getMeliFiscalStatusLabel(sale.arca_status)}</p>
            <MeliInvoiceActions
              canIssue={canIssue && sale.status !== "CANCELLED"}
              orgSlug={orgSlug}
              saleId={sale.id}
              status={sale.arca_status}
            />
            <p>Factura: {sale.invoice_number ?? "Sin emitir"}</p>
            {sale.arca_last_error && (
              <p className="text-destructive">{sale.arca_last_error}</p>
            )}
            <p className="font-semibold">
              Total: {formatCurrency(sale.total_amount, sale.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comprador</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{buyerName}</p>
            <p>
              {receiver.document_type}: {receiver.document_number}
            </p>
            <p>{receiver.address}</p>
            <p>
              {sale.customer_id ? "Cliente registrado" : "Comprador ocasional"}
            </p>
            {canIssue &&
              sale.updated_at &&
              sale.status === "DELIVERED" &&
              ["not_requested", "error"].includes(sale.arca_status) && (
                <MeliReceiverCorrection
                  key={sale.updated_at}
                  orgSlug={orgSlug}
                  receiver={receiver}
                  saleId={sale.id}
                  updatedAt={sale.updated_at}
                />
              )}
          </CardContent>
        </Card>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">Producto</th>
              <th className="p-3">Cantidad</th>
              <th className="p-3">Peso/volumen</th>
              <th className="p-3 text-right">Precio</th>
              <th className="p-3 text-right">Descuento</th>
              <th className="p-3 text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr className="border-b last:border-0" key={item.id}>
                <td className="p-3">
                  {item.description}{" "}
                  {item.variant &&
                    [item.variant.talle, item.variant.color]
                      .filter(Boolean)
                      .join(" / ")}
                </td>
                <td className="p-3">{item.quantity}</td>
                <td className="p-3">{item.unit_quantity ?? "—"}</td>
                <td className="p-3 text-right">
                  {formatCurrency(item.unit_price, sale.currency)}
                </td>
                <td className="p-3 text-right">
                  {formatCurrency(item.discount_amount, sale.currency)}
                </td>
                <td className="p-3 text-right">
                  {formatCurrency(item.subtotal, sale.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MeliCreditNotes
        canCreate={canCreateCreditNote && sale.arca_status === "authorized"}
        canIssue={canIssue}
        currency={sale.currency}
        notes={creditNotes.notes}
        orgSlug={orgSlug}
        remaining={creditNotes.remaining}
        saleId={sale.id}
      />
      {paymentSale && (
        <Card>
          <CardHeader>
            <CardTitle>Cobros Meli</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Bruto cobrado registrado:{" "}
              {formatCurrency(
                paymentSale.collectedAmount,
                paymentSale.currency
              )}
            </p>
            <p>
              Sin cobro registrado:{" "}
              {formatCurrency(
                paymentSale.outstandingAmount,
                paymentSale.currency
              )}
            </p>
            <Link
              className="font-medium hover:underline"
              href={`/org/${orgSlug}/cobranzas/mercado-libre/${sale.id}`}
            >
              Registrar / consultar cobros en Cobranzas
            </Link>
          </CardContent>
        </Card>
      )}
      <MeliPhysicalReturns
        canCreate={canManageReturns && sale.status === "DELIVERED"}
        initialHistory={physicalReturns}
        orgSlug={orgSlug}
        saleId={sale.id}
      />
      <Card>
        <CardContent className="space-y-2 pt-5 text-sm">
          <div className="flex justify-between">
            <span>Neto de las líneas</span>
            <span>
              {formatCurrency(
                truncateMoney(
                  sale.items.reduce((sum, item) => sum + item.subtotal, 0)
                ),
                sale.currency
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Descuento global</span>
            <span>
              {formatCurrency(sale.global_discount_amount, sale.currency)}
            </span>
          </div>
          {sale.taxes.map((tax) => (
            <div className="flex justify-between" key={tax.id}>
              <span>
                {tax.name} {tax.rate}%
              </span>
              <span>{formatCurrency(tax.tax_amount, sale.currency)}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatCurrency(sale.total_amount, sale.currency)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
