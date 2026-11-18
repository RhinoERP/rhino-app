import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateOnly } from "@/lib/format";
import { getMeliPhysicalReturnDetail } from "@/modules/mercadolibre/service/meli-physical-return.service";

const quantities = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 });

export default async function MeliPhysicalReturnPage({
  params,
}: {
  params: Promise<{ orgSlug: string; saleId: string; returnId: string }>;
}) {
  const { orgSlug, saleId, returnId } = await params;
  if (
    !(
      z.uuid().safeParse(saleId).success && z.uuid().safeParse(returnId).success
    )
  ) {
    notFound();
  }
  const receipt = await getMeliPhysicalReturnDetail(orgSlug, saleId, returnId);
  if (!receipt) {
    notFound();
  }
  return (
    <div className="space-y-5">
      <Link
        className="text-sm hover:underline"
        href={`/org/${orgSlug}/venta-directa/mercado-libre/${saleId}`}
      >
        Volver a la venta Meli
      </Link>
      <h1 className="font-heading text-2xl">
        Devolución física {receipt.id.slice(0, 8)}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Recepción de mercadería</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Venta Meli: #{receipt.saleNumber}</p>
          <p>Fecha de recepción: {formatDateOnly(receipt.returnDate)}</p>
          <p>Registrada: {formatDate(receipt.receivedAt)}</p>
          <p>Depósito original: {receipt.sourceWarehouseName}</p>
          <p>Depósito de recepción: {receipt.warehouseName}</p>
          <p>Motivo: {receipt.reason}</p>
          <p className="text-muted-foreground">
            Este documento registra mercadería recibida. La nota de crédito y el
            movimiento de dinero se gestionan por separado.
          </p>
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">Producto</th>
              <th className="p-3">Lote original</th>
              <th className="p-3">Cantidad recibida</th>
              <th className="p-3">Piezas</th>
              <th className="p-3">Stock vendible</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item) => (
              <tr className="border-b last:border-0" key={item.id}>
                <td className="p-3">{item.name}</td>
                <td className="p-3">
                  {item.lotNumber}
                  {item.expirationDate && (
                    <p className="text-muted-foreground text-xs">
                      Vence {formatDateOnly(item.expirationDate)}
                    </p>
                  )}
                </td>
                <td className="p-3">
                  {quantities.format(item.quantity)}{" "}
                  {item.unitOfMeasure ?? "de stock"}
                </td>
                <td className="p-3">
                  {item.unitQuantity > 0
                    ? quantities.format(item.unitQuantity)
                    : "—"}
                </td>
                <td className="p-3">
                  {item.restock ? "Reingresado" : "Sin reposición"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="space-y-3 rounded-md border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Referencias de trazabilidad
        </summary>
        <p className="break-all">Documento: {receipt.id}</p>
        <p className="break-all">Responsable: {receipt.createdBy}</p>
        {receipt.items.map((item) => (
          <div className="space-y-1 border-t pt-2" key={item.id}>
            <p className="font-medium">
              {item.name} · Lote {item.lotNumber}
            </p>
            <p className="break-all">
              Salida original: {item.sourceMovementId}
            </p>
            <p className="break-all">Lote original: {item.sourceLotId}</p>
            {item.movements.map((movement) => (
              <p className="break-all" key={movement.id}>
                Reingreso: {movement.id} · Lote destino: {movement.lotNumber} (
                {movement.lotId})
              </p>
            ))}
            {!item.restock && (
              <p className="text-muted-foreground">
                Mercadería recibida sin movimiento de ingreso al stock vendible.
              </p>
            )}
          </div>
        ))}
      </details>
    </div>
  );
}
