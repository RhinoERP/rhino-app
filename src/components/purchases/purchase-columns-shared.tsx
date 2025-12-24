"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";

type PurchaseActionsCellProps = {
  purchase: PurchaseOrderWithSupplier;
  orgSlug: string;
};

export function PurchaseActionsCell({
  purchase,
  orgSlug,
}: PurchaseActionsCellProps) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 p-0" variant="ghost">
            <span className="sr-only">Abrir menú</span>
            <DotsThreeOutlineVerticalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <Link
              className="flex w-full items-center"
              href={`/org/${orgSlug}/compras/${purchase.id}`}
            >
              Ver detalles
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function createActionsColumn(
  orgSlug: string
): ColumnDef<PurchaseOrderWithSupplier> {
  return {
    header: () => <SlidersHorizontalIcon className="mr-2 ml-auto size-4" />,
    id: "actions",
    enableHiding: false,
    enableColumnFilter: false,
    enableSorting: false,
    size: 10,
    enableResizing: true,
    cell: ({ row }) => (
      <PurchaseActionsCell orgSlug={orgSlug} purchase={row.original} />
    ),
  };
}
