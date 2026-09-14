"use client";

import { FileTextIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { formatDateTime } from "@/lib/utils";
import type {
  ArcaRelatedFiscalDocument,
  AuthorizedArcaInvoiceListItem,
} from "@/modules/arca/server/invoices.service";
import type { Option } from "@/types/data-table";
import {
  createArcaInvoiceColumns,
  formatArcaPointAndVoucher,
  getArcaInvoiceTypeLabel,
} from "./arca-invoice-columns";
import { ArcaInvoiceDownloadButton } from "./arca-invoice-download-button";
import { ArcaInvoicePreviewButton } from "./arca-invoice-preview-button";

type ArcaInvoicesTableProps = {
  orgSlug: string;
  invoices: AuthorizedArcaInvoiceListItem[];
};

function buildCustomerOptions(
  invoices: AuthorizedArcaInvoiceListItem[]
): Option[] {
  const customersMap = new Map<string, string>();

  for (const invoice of invoices) {
    const name =
      invoice.customer.fantasy_name ||
      invoice.customer.business_name ||
      "Cliente desconocido";
    customersMap.set(invoice.customer.id, name);
  }

  return Array.from(customersMap.entries())
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildSellerOptions(
  invoices: AuthorizedArcaInvoiceListItem[]
): Option[] {
  const sellersMap = new Map<string, string>();

  for (const invoice of invoices) {
    if (!invoice.seller?.id) {
      continue;
    }

    const label =
      invoice.seller.name || invoice.seller.email || "Vendedor sin nombre";
    sellersMap.set(invoice.seller.id, label);
  }

  return Array.from(sellersMap.entries())
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getRelatedDocumentHref(
  orgSlug: string,
  document: ArcaRelatedFiscalDocument
): string {
  return document.source === "credit_note"
    ? `/org/${orgSlug}/notas-de-credito/${document.id}`
    : `/org/${orgSlug}/ventas/${document.id}`;
}

function RelatedDocumentActions({
  document,
  orgSlug,
}: {
  document: ArcaRelatedFiscalDocument;
  orgSlug: string;
}) {
  if (document.source === "credit_note") {
    return (
      <Button asChild size="sm" type="button" variant="outline">
        <Link href={getRelatedDocumentHref(orgSlug, document)}>
          Ver detalle
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <ArcaInvoicePreviewButton
        invoiceNumber={document.invoice_number}
        orgSlug={orgSlug}
        saleId={document.id}
      />
      <ArcaInvoiceDownloadButton orgSlug={orgSlug} saleId={document.id} />
    </div>
  );
}

function RelatedDocumentCell({
  columnId,
  document,
  invoice,
  orgSlug,
}: {
  columnId: string;
  document: ArcaRelatedFiscalDocument;
  invoice: AuthorizedArcaInvoiceListItem;
  orgSlug: string;
}) {
  switch (columnId) {
    case "expander":
      return <span className="block w-8" />;
    case "sale_number":
      return (
        <span className="pl-3 text-muted-foreground text-xs">
          Comprobante asociado
        </span>
      );
    case "invoice_number":
      return (
        <Link
          className="font-mono text-sm transition-colors hover:text-blue-600"
          href={getRelatedDocumentHref(orgSlug, document)}
        >
          {document.invoice_number ?? "—"}
        </Link>
      );
    case "customer":
      return (
        <div className="text-muted-foreground text-sm">
          {invoice.customer.fantasy_name || invoice.customer.business_name}
        </div>
      );
    case "seller":
      return (
        <div className="text-muted-foreground text-sm">
          {invoice.seller?.name || invoice.seller?.email || "—"}
        </div>
      );
    case "sale_date":
      return <span className="text-muted-foreground">—</span>;
    case "arca_authorized_at":
      return document.arca_authorized_at ? (
        <span>{formatDateTime(document.arca_authorized_at)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "invoice_type":
      return <span>{getArcaInvoiceTypeLabel(document.invoice_type)}</span>;
    case "status":
    case "invoice_email_status":
      return <span className="text-muted-foreground">—</span>;
    case "arca_cae":
      return (
        <span className="font-mono text-sm">{document.arca_cae ?? "—"}</span>
      );
    case "point_and_voucher":
      return (
        <span className="font-mono text-sm">
          {formatArcaPointAndVoucher(document)}
        </span>
      );
    case "total_amount":
      return (
        <div className="text-right font-semibold">
          {formatCurrency(document.total_amount)}
        </div>
      );
    case "download":
      return <RelatedDocumentActions document={document} orgSlug={orgSlug} />;
    default:
      return null;
  }
}

export function ArcaInvoicesTable({
  orgSlug,
  invoices,
}: ArcaInvoicesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const customerOptions = useMemo(
    () => buildCustomerOptions(invoices),
    [invoices]
  );
  const sellerOptions = useMemo(() => buildSellerOptions(invoices), [invoices]);

  const columns = useMemo(
    () => createArcaInvoiceColumns(orgSlug, customerOptions, sellerOptions),
    [orgSlug, customerOptions, sellerOptions]
  );

  const table = useReactTable<AuthorizedArcaInvoiceListItem>({
    data: invoices,
    columns,
    state: {
      globalFilter,
    },
    globalFilterFn: "includesString",
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowCanExpand: (row) => row.original.related_documents.length > 0,
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 20,
      },
      sorting: [
        {
          id: "arca_authorized_at",
          desc: true,
        },
      ],
    },
  });

  if (invoices.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay facturas emitidas</EmptyTitle>
            <EmptyDescription>
              Cuando la organización emita comprobantes fiscales en ARCA, van a
              aparecer listados aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable
        className="[&_td:first-child]:w-10 [&_th:first-child]:w-10"
        renderExpandedRows={({ row }) => (
          <>
            {row.original.related_documents.map((document) => (
              <TableRow
                className="hover:bg-muted/50"
                key={`${document.source}:${document.id}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={`${document.id}:${cell.id}`}>
                    <RelatedDocumentCell
                      columnId={cell.column.id}
                      document={document}
                      invoice={row.original}
                      orgSlug={orgSlug}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </>
        )}
        table={table}
      >
        <DataTableToolbar
          globalFilterPlaceholder="Buscar venta, factura, CAE, cliente..."
          table={table}
          useGlobalFilters
        />
      </DataTable>
    </div>
  );
}
