import { utils, write } from "xlsx";

export type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
  numFmt?: string; // XLSX format string, e.g. '#,##0.00'
};

type NumericCol = { index: number; fmt: string | undefined };

function applyNumericFormats(
  ws: ReturnType<typeof utils.aoa_to_sheet>,
  numericCols: NumericCol[]
): void {
  const range = utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    for (const { index, fmt } of numericCols) {
      const cellRef = utils.encode_cell({ r, c: index });
      const cell = ws[cellRef];
      if (cell) {
        cell.t = "n";
        cell.z = fmt;
      }
    }
  }
}

/**
 * Builds an xlsx Buffer from columns definition and rows.
 * Supports multiple sheets: pass an array of { sheetName, columns, rows }.
 */
export function buildWorkbook(
  sheets: Array<{
    sheetName: string;
    columns: ExcelColumn[];
    rows: Record<string, unknown>[];
  }>
): Buffer {
  const wb = utils.book_new();

  for (const { sheetName, columns, rows } of sheets) {
    // Build header row
    const header = columns.map((c) => c.header);

    // Build data rows aligned to column order
    const data = rows.map((row) => columns.map((col) => row[col.key] ?? ""));

    const wsData = [header, ...data];
    const ws = utils.aoa_to_sheet(wsData);

    // Column widths
    ws["!cols"] = columns.map((c) => ({ wch: c.width ?? 18 }));

    // Apply number format to numeric columns
    const numericCols = columns
      .map((c, i) => ({ index: i, fmt: c.numFmt }))
      .filter((c) => c.fmt);

    if (numericCols.length > 0) {
      applyNumericFormats(ws, numericCols);
    }

    utils.book_append_sheet(wb, ws, sheetName);
  }

  return write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
