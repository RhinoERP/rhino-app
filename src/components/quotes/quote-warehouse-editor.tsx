"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getQuoteWarehousesAction,
  updateQuoteWarehouseAction,
} from "@/modules/quotes/actions/quote-warehouse.actions";

const schema = z.object({ warehouseId: z.uuid() });

export function QuoteWarehouseEditor(props: {
  orgSlug: string;
  quoteId: string;
  warehouseId: string;
}) {
  const { can } = usePermissions();
  const canManage = can("quotes.manage") || can("organization.admin");
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: { warehouseId: props.warehouseId },
  });
  const query = useQuery({
    queryKey: ["quote-warehouses", props.orgSlug],
    queryFn: () => getQuoteWarehousesAction(props.orgSlug),
    enabled: canManage,
    staleTime: 0,
  });
  if (!canManage) {
    return null;
  }
  const submit = form.handleSubmit(async ({ warehouseId }) => {
    const result = await updateQuoteWarehouseAction({ ...props, warehouseId });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Depósito actualizado. El presupuesto no reserva stock.");
    router.refresh();
  });
  return (
    <form className="space-y-3 rounded-md border p-4" onSubmit={submit}>
      <Label htmlFor="quote-warehouse">Depósito de salida</Label>
      {query.isPending && <output>Cargando depósitos...</output>}
      {query.isError && (
        <p className="text-destructive text-sm">
          No se pudieron cargar los depósitos.
        </p>
      )}
      <Controller
        control={form.control}
        name="warehouseId"
        render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger id="quote-warehouse">
              <SelectValue placeholder="Seleccioná un depósito habilitado" />
            </SelectTrigger>
            <SelectContent>
              {query.data?.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Button
        disabled={
          form.formState.isSubmitting || query.isFetching || !query.data?.length
        }
        type="submit"
      >
        Guardar depósito
      </Button>
      <p className="text-muted-foreground text-xs">
        Puede cambiarse hasta convertir el presupuesto en pedido.
      </p>
    </form>
  );
}
