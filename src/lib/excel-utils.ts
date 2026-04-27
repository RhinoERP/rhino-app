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
    ["Nombre", "SKU", "Precio"], // Headers
    ...products.map((product) => [
      product.name,
      product.sku,
      "", // Empty price column
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
    ],
  });
}
