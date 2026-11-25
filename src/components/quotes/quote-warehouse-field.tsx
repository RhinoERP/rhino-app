"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getQuoteWarehousesAction } from "@/modules/quotes/actions/quote-warehouse.actions";
import type { QuoteFormValues } from "@/modules/quotes/types";

export function QuoteWarehouseField({ orgSlug }: { orgSlug: string }) {
  const form = useFormContext<QuoteFormValues>();
  const query = useQuery({
    queryKey: ["quote-warehouses", orgSlug],
    queryFn: () => getQuoteWarehousesAction(orgSlug),
    staleTime: 0,
  });
  useEffect(() => {
    if (query.data?.length === 1 && !form.getValues("warehouseId")) {
      form.setValue("warehouseId", query.data[0].id);
    }
  }, [query.data, form]);
  if (query.isPending) {
    return <output>Cargando depósitos...</output>;
  }
  if (query.isError || !query.data.length) {
    return (
      <p className="text-destructive text-sm">
        No hay depósitos disponibles o no se pudieron cargar.
      </p>
    );
  }
  return (
    <FormField
      control={form.control}
      name="warehouseId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Depósito de salida</FormLabel>
          {query.data.length === 1 &&
          (!field.value || field.value === query.data[0].id) ? (
            <p className="text-sm">{query.data[0].name}</p>
          ) : (
            <Select onValueChange={field.onChange} value={field.value ?? ""}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná un depósito" />
              </SelectTrigger>
              <SelectContent>
                {query.data.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
