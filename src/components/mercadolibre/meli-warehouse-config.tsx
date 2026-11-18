"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { saveMeliWarehouseAction } from "@/modules/mercadolibre/actions/meli-queries.action";

const schema = z.object({ warehouseId: z.uuid("Seleccioná un depósito.") });
export function MeliWarehouseConfig({
  orgSlug,
  initial,
}: {
  orgSlug: string;
  initial: { warehouseId: string; warehouses: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { warehouseId: initial.warehouseId },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mercado Libre</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const result = await saveMeliWarehouseAction(
                orgSlug,
                values.warehouseId
              );
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              toast.success("Depósito Meli actualizado");
              router.refresh();
            })
          )}
        >
          <Label htmlFor="meli-warehouse">
            Depósito para las ventas Mercado Libre
          </Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            id="meli-warehouse"
            {...form.register("warehouseId")}
          >
            <option value="">Seleccionar depósito</option>
            {initial.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-sm">
            Usa los precios de Venta Directa. Los operadores deben tener
            asignado este depósito.
          </p>
          <p className="text-destructive text-sm">
            {form.formState.errors.warehouseId?.message}
          </p>
          <Button disabled={pending} type="submit">
            {pending ? "Guardando…" : "Guardar depósito Meli"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
