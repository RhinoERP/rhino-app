"use client";

import {
  CaretDown,
  ListBulletsIcon,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { ImportPriceListDialog } from "@/components/price-lists/import-price-list-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usePriceLists } from "@/modules/price-lists/hooks/use-price-lists";
import type { PriceList } from "@/modules/price-lists/types";
import { createPriceListColumns } from "./columns";

type PriceListsDataTableProps = {
  orgSlug: string;
};

export function PriceListsDataTable({ orgSlug }: PriceListsDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => createPriceListColumns(orgSlug), [orgSlug]);

  const { data } = usePriceLists(orgSlug);

  // Group price lists by supplier
  const groupedPriceLists = useMemo(() => {
    const groups = new Map<string, PriceList[]>();
    for (const priceList of data) {
      const supplierKey = priceList.supplier_id;

      if (!groups.has(supplierKey)) {
        groups.set(supplierKey, []);
      }
      groups.get(supplierKey)?.push(priceList);
    }

    // Sort groups by supplier name
    return Array.from(groups.entries())
      .map(([supplierId, lists]) => ({
        supplierId,
        supplierName: lists[0]?.supplier_name ?? "Sin proveedor",
        priceLists: lists.sort(
          (a, b) =>
            new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime()
        ),
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [data]); // Filter groups based on global filter
  const filteredGroups = useMemo(() => {
    if (!globalFilter) {
      return groupedPriceLists;
    }

    const lowerFilter = globalFilter.toLowerCase();
    return groupedPriceLists
      .map((group) => ({
        ...group,
        priceLists: group.priceLists.filter(
          (pl) =>
            pl.name.toLowerCase().includes(lowerFilter) ||
            pl.supplier_name?.toLowerCase().includes(lowerFilter)
        ),
      }))
      .filter((group) => group.priceLists.length > 0);
  }, [groupedPriceLists, globalFilter]);

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListBulletsIcon className="size-6" weight="duotone" />
            </EmptyMedia>

            <EmptyTitle>No hay listas de precios</EmptyTitle>
            <EmptyDescription>
              Aún no has importado ninguna lista de precios.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ImportPriceListDialog orgSlug={orgSlug} />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Buscar por nombre o proveedor..."
            value={globalFilter}
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredGroups.map((group) => (
          <SupplierPriceListGroup
            columns={columns}
            group={group}
            key={group.supplierId}
            orgSlug={orgSlug}
          />
        ))}
      </div>
    </div>
  );
}

type SupplierPriceListGroupProps = {
  group: {
    supplierId: string;
    supplierName: string;
    priceLists: PriceList[];
  };
  columns: ReturnType<typeof createPriceListColumns>;
  orgSlug: string;
};

function SupplierPriceListGroup({
  group,
  columns,
}: SupplierPriceListGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  const table = useReactTable<PriceList>({
    data: group.priceLists,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <div className="rounded-lg border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-accent/50">
          <div className="flex items-center gap-3">
            <CaretDown
              className={cn(
                "size-5 transition-transform",
                isOpen ? "rotate-0" : "-rotate-90"
              )}
            />
            <div className="text-left">
              <h3 className="font-semibold">{group.supplierName}</h3>
              <p className="text-muted-foreground text-sm">
                {group.priceLists.length}{" "}
                {group.priceLists.length === 1 ? "lista" : "listas"} de precios
              </p>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead colSpan={header.colSpan} key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
