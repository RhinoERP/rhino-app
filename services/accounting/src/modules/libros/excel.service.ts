import { utils, write } from "xlsx";

const CSV_ESCAPE_REGEX = /[",\r\n]/;

export type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
  numFmt?: string; // XLSX format string, e.g. '#,##0.00'
};

function normalizeExportValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return JSON.stringify(value);
}

function escapeDelimitedValue(value: string, delimiter: string): string {
  if (delimiter === "\t") {
    return value.replace(/[\t\r\n]+/g, " ");
  }

  if (!CSV_ESCAPE_REGEX.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

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

export function buildDelimitedFile(
  columns: ExcelColumn[],
  rows: Record<string, unknown>[],
  delimiter: "," | "\t"
): Buffer {
  const headerLine = columns
    .map((column) => escapeDelimitedValue(column.header, delimiter))
    .join(delimiter);

  const lines = rows.map((row) =>
    columns
      .map((column) =>
        escapeDelimitedValue(normalizeExportValue(row[column.key]), delimiter)
      )
      .join(delimiter)
  );

  return Buffer.from(`\uFEFF${[headerLine, ...lines].join("\r\n")}`, "utf-8");
}
