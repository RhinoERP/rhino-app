export const MAX_SUPPLIER_INVOICE_PDF_SIZE = 10 * 1024 * 1024;

export function validateSupplierInvoicePdf(file: File | null): string | null {
  if (!file || file.size === 0) {
    return null;
  }
  if (file.type !== "application/pdf") {
    return "El comprobante debe ser un PDF.";
  }
  if (file.size > MAX_SUPPLIER_INVOICE_PDF_SIZE) {
    return "El PDF no puede superar los 10 MiB (10.485.760 bytes).";
  }
  return null;
}
