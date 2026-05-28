"use client";

import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orderDetailQueryKey } from "@/modules/orders/queries/query-keys";
import type { OrderWithHistory } from "@/modules/orders/types";
import { GarmentDesigner } from "./garment-designer";

type BocectoEditorProps = {
  order: OrderWithHistory;
  orgSlug: string;
};

export function BocetoEditor({ order, orgSlug }: BocectoEditorProps) {
  const queryClient = useQueryClient();
  const items = order.quotes?.quote_items ?? [];

  // Si no hay items, mostrar un diseñador genérico
  const displayItems =
    items.length > 0
      ? items.map((item) => ({
          id: item.id,
          name: item.description || "Prenda",
          quantity: item.quantity,
        }))
      : [{ id: "default", name: "Prenda", quantity: 1 }];

  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Diseñá el boceto visual de cada prenda. Subí el logo, posicionalo sobre
        la prenda y descargá el PDF para que el cliente lo apruebe.
      </p>

      {displayItems.map((item, idx) => (
        <Card key={item.id}>
          <CardHeader
            className="cursor-pointer pb-3"
            onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {item.name}{" "}
                <span className="font-normal text-muted-foreground text-sm">
                  × {item.quantity} unidades
                </span>
              </CardTitle>
              {openIndex === idx ? (
                <CaretUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <CaretDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>

          {openIndex === idx && (
            <CardContent className="border-t pt-4">
              <GarmentDesigner
                itemIndex={idx}
                onSaved={() =>
                  queryClient.invalidateQueries({
                    queryKey: orderDetailQueryKey(orgSlug, order.id),
                  })
                }
                order={order}
                orgSlug={orgSlug}
                productName={item.name}
                quantity={item.quantity}
              />
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
