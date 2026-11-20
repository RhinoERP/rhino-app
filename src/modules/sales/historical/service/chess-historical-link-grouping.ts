export type ChessHistoricalRelatedLine = {
  line_number: number | null;
  product_chess_code: string | null;
  description: string | null;
};

export type ChessHistoricalDocumentLink = {
  target_document_id: string | null;
  target_source_key: string;
  target_document_code: string;
  target_document_name: string | null;
  target_letter: string;
  target_series: number;
  target_number: number;
  target_document_date: string | null;
  target_printed_number: string | null;
  target_relation_type: string | null;
  relation_type: string;
  related_lines: ChessHistoricalRelatedLine[];
};

type RawChessHistoricalLink = Record<string, unknown>;

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined || value === ""
    ? null
    : String(value);
}

function relatedLineKey(line: ChessHistoricalRelatedLine) {
  return `${line.line_number ?? ""}|${line.product_chess_code ?? ""}|${line.description ?? ""}`;
}

function createGroup(
  row: RawChessHistoricalLink,
  relationType: string
): ChessHistoricalDocumentLink {
  return {
    target_document_id: asNullableString(row.target_document_id),
    target_source_key: String(row.target_source_key ?? ""),
    target_document_code: String(row.target_document_code ?? ""),
    target_document_name: asNullableString(row.target_document_name),
    target_letter: String(row.target_letter ?? ""),
    target_series: Number(row.target_series ?? 0),
    target_number: Number(row.target_number ?? 0),
    target_document_date: asNullableString(row.target_document_date),
    target_printed_number: asNullableString(row.target_printed_number),
    target_relation_type: asNullableString(row.target_relation_type),
    relation_type: relationType,
    related_lines: [],
  };
}

function getRelatedLine(
  row: RawChessHistoricalLink
): ChessHistoricalRelatedLine {
  return {
    line_number:
      row.target_line_number === null || row.target_line_number === undefined
        ? null
        : Number(row.target_line_number),
    product_chess_code: asNullableString(row.target_product_chess_code),
    description: asNullableString(row.target_description),
  };
}

function addRelatedLine(
  group: ChessHistoricalDocumentLink,
  line: ChessHistoricalRelatedLine
) {
  const hasLineData =
    line.line_number !== null || line.product_chess_code || line.description;
  if (!hasLineData) {
    return;
  }
  const alreadyExists = group.related_lines.some(
    (existing) => relatedLineKey(existing) === relatedLineKey(line)
  );
  if (alreadyExists) {
    return;
  }
  group.related_lines.push(line);
}

/** Collapses repeated line-level CHESS relations into one target voucher row. */
export function groupChessHistoricalLinks(
  rows: RawChessHistoricalLink[]
): ChessHistoricalDocumentLink[] {
  const groups = new Map<string, ChessHistoricalDocumentLink>();

  for (const row of rows) {
    const targetSourceKey = String(row.target_source_key ?? "");
    const relationType = String(row.relation_type ?? "RELATED_DOCUMENT");
    const key = `${targetSourceKey}|${relationType}`;
    let group = groups.get(key);
    if (!group) {
      group = createGroup(row, relationType);
      groups.set(key, group);
    } else if (!group.target_document_id) {
      group.target_document_id = asNullableString(row.target_document_id);
    }
    addRelatedLine(group, getRelatedLine(row));
  }

  return [...groups.values()];
}
