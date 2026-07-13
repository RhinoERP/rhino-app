"use client";

import { FileTextIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderWithHistory } from "@/modules/orders/types";

type BocetoEditorProps = {
  orgSlug: string;
  order: OrderWithHistory;
};

export function BocetoEditor(_props: BocetoEditorProps) {
  const order = _props.order;
  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";
  const itemCount = quote?.quote_items.length ?? 0;
  const designs = order.order_designs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Boceto — {order.order_number}</h1>
        <p className="text-muted-foreground text-sm">
          {customerName} &middot; {itemCount} producto
          {itemCount !== 1 ? "s" : ""}
        </p>
      </div>

      {designs && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Boceto existente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {designs.products.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pr-4 pb-2 text-left font-medium">
                        Producto
                      </th>
                      <th className="px-4 pb-2 text-right font-medium">
                        Cant.
                      </th>
                      <th className="px-4 pb-2 text-left font-medium">
                        Tamaño
                      </th>
                      <th className="pb-2 pl-4 text-left font-medium">
                        Posición logo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {designs.products.map((product, idx) => (
                      <tr
                        className="border-b last:border-0"
                        key={`${product.product_id}-${idx}`}
                      >
                        <td className="py-2 pr-4">{product.product_name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {product.quantity}
                        </td>
                        <td className="px-4 py-2">{product.size}</td>
                        <td className="py-2 pl-4">{product.logo_position}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {designs.general_notes && (
              <div>
                <h4 className="mb-1 font-medium text-sm">Notas generales</h4>
                <p className="text-muted-foreground text-sm">
                  {designs.general_notes}
                </p>
              </div>
            )}
            {designs.client_approved_at && (
              <p className="text-emerald-600 text-sm">
                Aprobado por el cliente el{" "}
                {new Date(designs.client_approved_at).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <FileTextIcon
            className="h-12 w-12 text-muted-foreground/50"
            weight="duotone"
          />
          <div className="text-center">
            <p className="font-medium text-muted-foreground">
              Editor de boceto próximamente
            </p>
            <p className="mt-1 text-muted-foreground/60 text-sm">
              Esta funcionalidad estará disponible en una próxima actualización.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
