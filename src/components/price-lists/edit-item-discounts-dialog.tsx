"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePriceListItemDiscountsAction } from "@/modules/price-lists/actions/update-price-list-item-discounts.action";
import type { PriceListItem } from "@/modules/price-lists/types";
import { HABITUAL_DISCOUNT_FIELDS } from "@/modules/purchases/utils/purchase-discounts";

export function EditItemDiscountsDialog({
  orgSlug,
  item,
}: {
  orgSlug: string;
  item: PriceListItem;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(
    item.list_price ?? item.purchase_price ?? 0
  );
  const [discounts, setDiscounts] = useState(item);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await updatePriceListItemDiscountsAction({
        orgSlug,
        itemId: item.id,
        priceListId: item.price_list_id,
        listPrice: price,
        discounts,
      });
      if (!result.success) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      await client.invalidateQueries({
        queryKey: ["price-list-items", orgSlug, item.price_list_id],
      });
      setOpen(false);
      await client.invalidateQueries({
        queryKey: ["products", "by-supplier", orgSlug],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar");
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        setPrice(item.list_price ?? item.purchase_price ?? 0);
        setDiscounts(item);
        setError(null);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Descuentos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.product_name} · descuentos habituales</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Label>
            Precio de lista (unidad del producto)
            <Input
              disabled={pending}
              min={0}
              onChange={(e) => setPrice(Number(e.target.value))}
              step="0.01"
              type="number"
              value={price}
            />
          </Label>
          <div className="grid grid-cols-2 gap-3">
            {HABITUAL_DISCOUNT_FIELDS.map((field, index) => (
              <Label key={field}>
                Descuento {index + 1} %
                <Input
                  disabled={pending}
                  max={100}
                  min={0}
                  onChange={(e) =>
                    setDiscounts({
                      ...discounts,
                      [field]: Number(e.target.value),
                    })
                  }
                  step="any"
                  type="number"
                  value={discounts[field] ?? 0}
                />
              </Label>
            ))}
          </div>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <Button disabled={pending} onClick={save}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
