type ProductForExport = {
  name: string;
  sku: string;
};

/**
 * Generates and downloads an Excel file with products for a price list template.
 * The file contains three columns: Nombre (Product Name), SKU, and Precio (empty).
 */
export async function downloadProductsTemplate(
  products: ProductForExport[],
  supplierName: string
): Promise<void> {
  // Dynamically import xlsx to reduce bundle size
  const XLSX = await import("xlsx");

  // Create worksheet data with headers
  const worksheetData = [
    ["Nombre", "SKU", "Precio"], // Headers
    ...products.map((product) => [
      product.name,
      product.sku,
      "", // Empty price column
    ]),
  ];

  // Create worksheet from array
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths for better readability
  worksheet["!cols"] = [
    { wch: 40 }, // Nombre column width
    { wch: 20 }, // SKU column width
    { wch: 15 }, // Precio column width
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");

  // Generate filename with current date
  const today = new Date().toISOString().split("T")[0];
  const filename = `productos_${supplierName.replace(/\s+/g, "_")}_${today}.xlsx`;

  // Download file
  XLSX.writeFile(workbook, filename);
}
