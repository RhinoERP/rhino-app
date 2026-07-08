import type { JournalEntry, JournalEntryLine } from "../../db/types";

export type JournalEntryStatus = "ACTIVO" | "ANULADO";

export interface JournalEntryWithLines extends JournalEntry {
  lineas: JournalEntryLine[];
}

// Input para callCreateJournalEntry
export type CreateJournalEntryInput = {
  orgId: string;
  tipoEvento: string;
  referenciaId: string;
  referenciaTabla: string;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  idempotencyKey: string;
  creadoPor?: string;
  lineas: Array<{
    cuentaId: string;
    debe: string;
    haber: string;
    descripcion?: string;
  }>;
};
