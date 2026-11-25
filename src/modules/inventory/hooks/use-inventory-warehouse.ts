"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getInventoryWarehousesAction } from "../actions/warehouses.actions";

const schema = z.object({ warehouseId: z.uuid().optional() });
export type InventoryWarehouseValues = z.infer<typeof schema>;

export function useInventoryWarehouse(orgSlug: string, enabled = true) {
  const form = useForm<InventoryWarehouseValues>({
    resolver: zodResolver(schema),
    defaultValues: {},
  });
  const query = useQuery({
    queryKey: ["inventory-warehouses", orgSlug],
    queryFn: () => getInventoryWarehousesAction(orgSlug),
    enabled,
    staleTime: 0,
  });
  useEffect(() => {
    if (query.data?.length === 1 && !form.getValues("warehouseId")) {
      form.setValue("warehouseId", query.data[0].id);
    }
  }, [query.data, form]);
  return { form, query, warehouseId: form.watch("warehouseId") };
}
