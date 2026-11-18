const LABELS: Record<string, string> = {
  not_requested: "Sin emitir",
  pending: "Emitiendo",
  authorized: "Autorizada",
  error: "Error fiscal",
};
export function getMeliFiscalStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}
