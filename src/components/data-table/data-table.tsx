import {
  flexRender,
  type Row,
  type Table as TanstackTable,
} from "@tanstack/react-table";
import { Fragment, type ComponentProps, type ReactNode } from "react";

import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCommonPinningStyles } from "@/lib/data-table";
import { cn } from "@/lib/utils";
import { Frame, FramePanel } from "@/components/ui/frame";

interface DataTableProps<TData> extends ComponentProps<"div"> {
  table: TanstackTable<TData>;
  actionBar?: ReactNode;
  hidePagination?: boolean;
  fixedHeight?: boolean;
  renderSubComponent?: (props: { row: Row<TData> }) => ReactNode;
  onRowClick?: (row: Row<TData>) => void;
}

export function DataTable<TData>({
  table,
  actionBar,
  hidePagination = false,
  fixedHeight = false,
  renderSubComponent,
  onRowClick,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  return (
    <div
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      {children}
      <Frame className="w-full overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      ...getCommonPinningStyles({ column: header.column }),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              <>
                {table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn(onRowClick && "cursor-pointer")}
                      data-state={row.getIsSelected() && "selected"}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          style={{
                            ...getCommonPinningStyles({ column: cell.column }),
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {row.getIsExpanded() && renderSubComponent && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={row.getVisibleCells().length}
                          className="!border-b-0 bg-muted/20 p-0"
                        >
                          {renderSubComponent({ row })}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {fixedHeight &&
                  (() => {
                    const pageSize = table.getState().pagination.pageSize ?? 10;
                    const rowsCount = table.getRowModel().rows.length;
                    const emptyRowsCount = pageSize - rowsCount;
                    if (emptyRowsCount <= 0) return null;
                    return Array.from({ length: emptyRowsCount }).map(
                      (_, index) => (
                        <TableRow
                          key={`empty-${index}`}
                          className="hover:bg-transparent pointer-events-none"
                        >
                          {table.getVisibleLeafColumns().map((column) => (
                            <TableCell
                              key={`empty-cell-${column.id}`}
                              className="h-[52px] !border-b-0"
                              style={{
                                ...getCommonPinningStyles({ column }),
                              }}
                            >
                              &nbsp;
                            </TableCell>
                          ))}
                        </TableRow>
                      ),
                    );
                  })()}
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="text-center"
                  style={{
                    height: fixedHeight
                      ? `${(table.getState().pagination.pageSize ?? 10) * 52}px`
                      : "96px",
                  }}
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Frame>
      {!hidePagination && (
        <div className="flex flex-col gap-2.5">
          <DataTablePagination table={table} />
          {actionBar &&
            table.getFilteredSelectedRowModel().rows.length > 0 &&
            actionBar}
        </div>
      )}
    </div>
  );
}
