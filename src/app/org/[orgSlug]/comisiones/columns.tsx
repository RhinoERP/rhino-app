"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { CommissionSeller } from "@/modules/commissions/types";

export function createCommissionsColumns(): ColumnDef<CommissionSeller>[] {
  return [
    {
      id: "sellerName",
      accessorKey: "sellerName",
      header: "Vendedor",
    },
    {
      id: "baseCommissionRate",
      accessorKey: "baseCommissionRate",
      header: "Com. base",
    },
    {
      id: "saleCount",
      accessorKey: "saleCount",
      header: "Ventas",
    },
    {
      id: "totalSubtotal",
      accessorKey: "totalSubtotal",
      header: "Subtotal",
    },
    {
      id: "totalCommission",
      accessorKey: "totalCommission",
      header: "Comisión",
    },
  ];
}
