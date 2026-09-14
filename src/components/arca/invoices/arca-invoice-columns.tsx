"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Calendar,
  ChevronRight,
  DollarSign,
  FileDigit,
  Hash,
  Mail,
  Receipt,
  Ticket,
  User,
} from "lucide-react";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { formatDateTime } from "@/lib/utils";
import type {
  ArcaRelatedFiscalDocument,
  AuthorizedArcaInvoiceListItem,
} from "@/modules/arca/server/invoices.service";
import { INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";
import type { InvoiceType } from "@/modules/sales/types";
import { ArcaInvoiceDownloadButton } from "./arca-invoice-download-button";
import { ArcaInvoiceEmailButton } from "./arca-invoice-email-button";
import { ArcaInvoicePreviewButton } from "./arca-invoice-preview-button";

const invoiceTypeLabels: Record<InvoiceType, string> = INVOICE_TYPE_LABELS;

const saleStatusLabels: Record<string, string> = {
  DRAFT: "Preventa",
  INCOMPLETE: "Incompleta",
  CONFIRMED: "Confirmada",
  DISPATCH: "Despachada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
  COMPLETED: "Completada",
};

const invoiceEmailStatusLabels: Record<string, string> = {
  not_sent: "No enviado",
  pending: "Enviando",
  sent: "Enviado",
  delivered: "Entregado",
  delivery_delayed: "Demorado",
  bounced: "Rebotado",
  complained: "Reclamado",
  failed: "Error",
};

const invoiceEmailStatusBadgeClasses: Record<string, string> = {
  not_sent: "border-slate-200 bg-slate-50 text-slate-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  sent: "border-blue-200 bg-blue-50 text-blue-700",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  delivery_delayed: "border-amber-200 bg-amber-50 text-amber-700",
  bounced: "border-red-200 bg-red-50 text-red-700",
  complained: "border-red-200 bg-red-50 text-red-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

function getCustomerDisplayName(
  invoice: AuthorizedArcaInvoiceListItem
): string {
  return (
    invoice.customer?.fantasy_name ||
    invoice.customer?.business_name ||
    "Cliente desconocido"
  );
}

function parseDateOnly(dateString?: string | null): number | null {
  if (!dateString) {
    return null;
  }

  const [year, month, day] = dateString.split("T")[0].split("-").map(Number);

  if (
    !(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))
  ) {
    return null;
  }

  const timestamp = new Date(year, month - 1, day).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function parseTimestamp(dateString?: string | null): number | null {
  if (!dateString) {
    return null;
  }

  const timestamp = new Date(dateString).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function parseFilterTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return parseFilterTimestamp(value[0]);
  }

  const timestamp = typeof value === "number" ? value : Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isEmptyDateRangeFilterValue(value: unknown): boolean {
  if (!value) {
    return true;
  }

  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => !item);
}

type ArcaVoucherFields = Pick<
  AuthorizedArcaInvoiceListItem,
  "arca_point_of_sale" | "arca_voucher_number"
>;

export function formatArcaPointAndVoucher(
  invoice: ArcaVoucherFields | ArcaRelatedFiscalDocument
): string {
  if (!(invoice.arca_point_of_sale && invoice.arca_voucher_number)) {
    return "—";
  }

  return `${String(invoice.arca_point_of_sale).padStart(4, "0")} / ${String(
    invoice.arca_voucher_number
  ).padStart(8, "0")}`;
}

export function getArcaInvoiceTypeLabel(invoiceType: InvoiceType): string {
  return invoiceTypeLabels[invoiceType] ?? invoiceType;
}

function getFiscalDocuments(invoice: AuthorizedArcaInvoiceListItem) {
  const documents = [...invoice.related_documents];
  if (invoice.is_primary_authorized) {
    documents.unshift({
      id: invoice.id,
      source: invoice.source === "pos_sale" ? "sales_order" : invoice.source,
      kind: "balance",
      invoice_number: invoice.invoice_number,
      invoice_type: invoice.invoice_type,
      arca_authorized_at: invoice.arca_authorized_at,
      arca_cae: invoice.arca_cae,
      arca_point_of_sale: invoice.arca_point_of_sale,
      arca_voucher_number: invoice.arca_voucher_number,
      total_amount: invoice.total_amount,
    });
  }
  return documents;
}

function matchesRelatedText(
  invoice: AuthorizedArcaInvoiceListItem,
  value: unknown,
  getValue: (document: ReturnType<typeof getFiscalDocuments>[number]) => string
): boolean {
  const filterValues = Array.isArray(value) ? value : [value];
  const normalizedFilters = filterValues
    .map((item) => String(item ?? "").toLocaleLowerCase())
    .filter(Boolean);
  if (!normalizedFilters.length) {
    return true;
  }
  return getFiscalDocuments(invoice).some((document) => {
    const target = getValue(document).toLocaleLowerCase();
    return normalizedFilters.every((filter) => target.includes(filter));
  });
}

function getInvoiceEmailDetail(invoice: AuthorizedArcaInvoiceListItem): string {
  if (invoice.invoice_email_delivered_at) {
    return `Entregado ${formatDateTime(invoice.invoice_email_delivered_at)}`;
  }

  if (invoice.invoice_email_sent_at) {
    return `Enviado ${formatDateTime(invoice.invoice_email_sent_at)}`;
  }

  return (
    invoice.invoice_email_recipient || invoice.customer.email || "Sin email"
  );
}

export function createArcaInvoiceColumns(
  orgSlug: string,
  customerOptions: Array<{ label: string; value: string }> = [],
  sellerOptions: Array<{ label: string; value: string }> = []
): ColumnDef<AuthorizedArcaInvoiceListItem>[] {
  const filterByDateRange = (
    dateString: string | null | undefined,
    parser: (dateValue: string | null | undefined) => number | null,
    filterValue: unknown
  ) => {
    const target = parser(dateString);
    if (target === null) {
      return false;
    }

    if (isEmptyDateRangeFilterValue(filterValue)) {
      return true;
    }

    const [from, to] = Array.isArray(filterValue)
      ? filterValue
      : [filterValue, undefined];
    const fromTs = parseFilterTimestamp(from);
    const toTs = parseFilterTimestamp(to);

    if (fromTs !== null && toTs !== null) {
      return target >= fromTs && target <= toTs;
    }

    if (fromTs !== null) {
      return target >= fromTs;
    }

    if (toTs !== null) {
      return target <= toTs;
    }

    return true;
  };

  const matchesRelatedDateRange = (
    invoice: AuthorizedArcaInvoiceListItem,
    filterValue: unknown
  ): boolean =>
    getFiscalDocuments(invoice).some((document) =>
      filterByDateRange(
        document.arca_authorized_at,
        parseTimestamp,
        filterValue
      )
    );

  return [
    {
      id: "expander",
      size: 40,
      header: () => null,
      cell: ({ row }) => {
        const documentsCount = row.original.related_documents.length;
        if (!documentsCount) {
          return null;
        }
        const expanded = row.getIsExpanded();
        return (
          <Button
            aria-label={`${expanded ? "Ocultar" : "Mostrar"} ${documentsCount} comprobante${documentsCount === 1 ? "" : "s"} asociado${documentsCount === 1 ? "" : "s"}`}
            className="size-8"
            onClick={(event) => {
              event.stopPropagation();
              row.toggleExpanded();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronRight
              className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </Button>
        );
      },
      enableColumnFilter: false,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "sale_number",
      accessorFn: (row) => String(row.sale_number ?? ""),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="N° Venta" />
      ),
      cell: ({ row }) => {
        const invoice = row.original;
        const saleNumber = invoice.sale_number ?? "—";
        const href =
          invoice.source === "pos_sale"
            ? `/org/${orgSlug}/venta-directa/${invoice.id}`
            : `/org/${orgSlug}/ventas/${invoice.id}`;

        return (
          <Link
            className="block font-mono text-sm transition-colors hover:text-blue-600"
            href={href}
          >
            {invoice.group_kind === "preventa" ? "Preventa " : ""}
            {saleNumber}
          </Link>
        );
      },
      meta: {
        label: "N° Venta",
        variant: "text",
        icon: Hash,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "invoice_number",
      accessorFn: (row) =>
        getFiscalDocuments(row)
          .map((document) => document.invoice_number ?? "")
          .join(" "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Factura" />
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {row.original.is_primary_authorized
            ? (row.original.invoice_number ?? "—")
            : "—"}
        </div>
      ),
      meta: {
        label: "Factura",
        variant: "text",
        icon: FileDigit,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
      filterFn: (row, _id, value) =>
        matchesRelatedText(
          row.original,
          value,
          (document) => document.invoice_number ?? ""
        ),
    },
    {
      id: "customer",
      accessorFn: (row) => getCustomerDisplayName(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      cell: ({ row }) => (
        <div className="font-medium">
          {getCustomerDisplayName(row.original)}
        </div>
      ),
      meta: {
        label: "Cliente",
        variant: "multiSelect",
        options: customerOptions,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.original.customer.id);
      },
    },
    {
      id: "seller",
      accessorFn: (row) => row.seller?.name || row.seller?.email || "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Vendedor" />
      ),
      cell: ({ row }) => {
        const seller = row.original.seller;
        return <div>{seller?.name || seller?.email || "—"}</div>;
      },
      meta: {
        label: "Vendedor",
        variant: "multiSelect",
        options: sellerOptions,
        icon: User,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.original.user_id);
      },
    },
    {
      id: "sale_date",
      accessorKey: "sale_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Fecha venta" />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.sale_date
            ? formatDateOnly(row.original.sale_date)
            : "—"}
        </div>
      ),
      meta: {
        label: "Fecha venta",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.sale_date, parseDateOnly, value),
    },
    {
      id: "arca_authorized_at",
      accessorKey: "latest_authorized_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Emitida en" />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.latest_authorized_at
            ? formatDateTime(row.original.latest_authorized_at)
            : "—"}
        </div>
      ),
      meta: {
        label: "Emitida en",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
      filterFn: (row, _id, value) =>
        matchesRelatedDateRange(row.original, value),
    },
    {
      id: "invoice_type",
      accessorFn: (row) =>
        getFiscalDocuments(row)
          .map((document) => document.invoice_type)
          .join(" "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Comprobante" />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.is_primary_authorized
            ? getArcaInvoiceTypeLabel(row.original.invoice_type)
            : "—"}
        </div>
      ),
      meta: {
        label: "Comprobante",
        variant: "multiSelect",
        options: (Object.keys(invoiceTypeLabels) as InvoiceType[]).map(
          (value) => ({
            label: invoiceTypeLabels[value],
            value,
          })
        ),
        icon: Receipt,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return getFiscalDocuments(row.original).some((document) =>
          filterValues.includes(document.invoice_type)
        );
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado venta" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.status
            ? (saleStatusLabels[row.original.status] ?? row.original.status)
            : "—"}
        </Badge>
      ),
      meta: {
        label: "Estado venta",
        variant: "multiSelect",
        options: Object.keys(saleStatusLabels).map((value) => ({
          label: saleStatusLabels[value],
          value,
        })),
      },
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: true,
      filterFn: (row, id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.getValue(id));
      },
    },
    {
      id: "arca_cae",
      accessorFn: (row) =>
        getFiscalDocuments(row)
          .map((document) => document.arca_cae ?? "")
          .join(" "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="CAE" />
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {row.original.is_primary_authorized
            ? (row.original.arca_cae ?? "—")
            : "—"}
        </div>
      ),
      meta: {
        label: "CAE",
        variant: "text",
        icon: Ticket,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        matchesRelatedText(
          row.original,
          value,
          (document) => document.arca_cae ?? ""
        ),
    },
    {
      id: "point_and_voucher",
      accessorFn: (row) =>
        getFiscalDocuments(row)
          .map((document) => formatArcaPointAndVoucher(document))
          .join(" "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Punto / Número" />
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {row.original.is_primary_authorized
            ? formatArcaPointAndVoucher(row.original)
            : "—"}
        </div>
      ),
      meta: {
        label: "Punto / Número",
        variant: "text",
        icon: Hash,
      },
      enableColumnFilter: false,
      enableSorting: false,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        matchesRelatedText(row.original, value, formatArcaPointAndVoucher),
    },
    {
      id: "invoice_email_status",
      accessorFn: (row) =>
        row.source === "pos_sale"
          ? "not_applicable"
          : (row.invoice_email_status ?? "not_sent"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Email" />
      ),
      cell: ({ row }) => {
        if (
          row.original.source === "pos_sale" ||
          !row.original.is_primary_authorized
        ) {
          return (
            <div className="text-muted-foreground text-sm">No disponible</div>
          );
        }

        const status = row.original.invoice_email_status ?? "not_sent";
        const label = invoiceEmailStatusLabels[status] ?? "No enviado";
        const badgeClass =
          invoiceEmailStatusBadgeClasses[status] ??
          invoiceEmailStatusBadgeClasses.not_sent;

        return (
          <div className="space-y-1">
            <Badge className={`border ${badgeClass}`} variant="outline">
              {label}
            </Badge>
            <div className="text-muted-foreground text-xs">
              {getInvoiceEmailDetail(row.original)}
            </div>
          </div>
        );
      },
      meta: {
        label: "Email",
        variant: "multiSelect",
        icon: Mail,
        options: Object.entries(invoiceEmailStatusLabels).map(
          ([value, label]) => ({
            value,
            label,
          })
        ),
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.getValue(id));
      },
    },
    {
      id: "total_amount",
      accessorFn: (row) => row.total_amount ?? 0,
      header: ({ column }) => (
        <DataTableColumnHeader
          className="ml-auto justify-end"
          column={column}
          label="Total"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right font-semibold">
          {row.original.is_primary_authorized
            ? formatCurrency(row.original.total_amount)
            : "—"}
        </div>
      ),
      meta: {
        label: "Total",
        variant: "text",
        icon: DollarSign,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: true,
    },
    {
      id: "download",
      header: () => <div className="text-right">Acciones</div>,
      cell: ({ row }) => {
        const invoice = row.original;
        if (!invoice.is_primary_authorized) {
          return (
            <div className="flex justify-end">
              <Button asChild size="sm" type="button" variant="outline">
                <Link href={`/org/${orgSlug}/ventas/${invoice.id}`}>
                  Ver detalle
                </Link>
              </Button>
            </div>
          );
        }

        if (invoice.source === "pos_sale") {
          return (
            <div className="flex justify-end">
              <Button asChild size="sm" type="button" variant="outline">
                <Link href={`/org/${orgSlug}/venta-directa/${invoice.id}`}>
                  Ver detalle
                </Link>
              </Button>
            </div>
          );
        }

        return (
          <div className="flex justify-end gap-2">
            <ArcaInvoicePreviewButton
              invoiceNumber={invoice.invoice_number}
              orgSlug={orgSlug}
              saleId={invoice.id}
            />
            <ArcaInvoiceDownloadButton orgSlug={orgSlug} saleId={invoice.id} />
            <ArcaInvoiceEmailButton
              customerEmail={invoice.customer.email}
              invoiceEmailRecipient={invoice.invoice_email_recipient}
              invoiceEmailStatus={invoice.invoice_email_status}
              orgSlug={orgSlug}
              saleId={invoice.id}
            />
          </div>
        );
      },
      enableColumnFilter: false,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
