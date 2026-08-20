import type {
  LedgerEntry,
  OrganizationExpense,
} from "@/modules/finances/types";

const SOURCE_LABELS: Record<string, string> = {
  cobro: "Cobro",
  credito_cliente: "Crédito aplicado",
  pago_proveedor: "Pago proveedor",
  gasto_operativo: "Gasto operativo",
};

const PM_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  deposito: "Depósito",
  tarjeta_de_credito: "Tarjeta crédito",
  tarjeta_de_debito: "Tarjeta débito",
  "e-cheq": "E-cheq",
};

export async function downloadLedgerExport(
  entries: LedgerEntry[],
  periodLabel: string
): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = entries.map((e) => [
    e.date,
    e.concept,
    SOURCE_LABELS[e.source] ?? e.source,
    e.debit ?? "",
    e.credit ?? "",
    e.running_balance,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    ["Fecha", "Concepto", "Tipo", "Debe", "Haber", "Saldo"],
    ...rows,
  ]);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 40 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Libro mayor");
  XLSX.writeFile(wb, `libro_mayor_${periodLabel}.xlsx`);
}

export async function downloadExpensesExport(
  expenses: OrganizationExpense[]
): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = expenses.map((e) => [
    e.expense_date,
    e.description,
    e.category?.name ?? "Sin categoría",
    e.payment_method ? (PM_LABELS[e.payment_method] ?? e.payment_method) : "",
    e.amount,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    ["Fecha", "Descripción", "Categoría", "Método de pago", "Monto"],
    ...rows,
  ]);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 40 },
    { wch: 20 },
    { wch: 20 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");
  const today = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `gastos_${today}.xlsx`);
}

type ProductForExport = {
  name: string;
  sku: string;
};

type WorksheetColumn = {
  wch: number;
};

type DownloadWorksheetOptions = {
  filename: string;
  sheetName: string;
  rows: unknown[][];
  columns?: WorksheetColumn[];
};

/**
 * Generates and downloads an Excel workbook from array rows.
 */
export async function downloadWorksheet({
  filename,
  sheetName,
  rows,
  columns,
}: DownloadWorksheetOptions): Promise<void> {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  if (columns) {
    worksheet["!cols"] = columns;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

/**
 * Generates and downloads an Excel file with products for a price list template.
 * The file contains three columns: Nombre (Product Name), SKU, and Precio (empty).
 */
export async function downloadProductsTemplate(
  products: ProductForExport[],
  supplierName: string
): Promise<void> {
  const worksheetData = [
    ["Nombre", "SKU", "Precio", "Moneda"], // Headers
    ...products.map((product) => [
      product.name,
      product.sku,
      "", // Empty price column
      "", // Empty currency column
    ]),
  ];

  // Generate filename with current date
  const today = new Date().toISOString().split("T")[0];
  const filename = `productos_${supplierName.replace(/\s+/g, "_")}_${today}.xlsx`;

  await downloadWorksheet({
    filename,
    sheetName: "Productos",
    rows: worksheetData,
    columns: [
      { wch: 40 }, // Nombre column width
      { wch: 20 }, // SKU column width
      { wch: 15 }, // Precio column width
      { wch: 10 }, // Moneda column width
    ],
  });
}
