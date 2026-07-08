import type { AccountingRule, AccountingRuleLine } from "../../db/types";

// ------------------------------------------------------------
// Regla con sus líneas cargadas (resultado de loadRulesWithLines)
// ------------------------------------------------------------
export interface RuleWithLines extends AccountingRule {
  lines: AccountingRuleLine[];
}

// ------------------------------------------------------------
// Línea resuelta — output del rules.engine por línea
// ------------------------------------------------------------
export type ResolvedLine = {
  lado: "DEBE" | "HABER";
  monto: string; // string numérico con 4 decimales
  cuentaId: string | null;
  cuentaCodigo: string | null; // account_code semántico (ej: "AR_CLIENTES")
  cuentaCodigoInterno: string | null; // codigo del plan de cuentas (ej: "1.1.01")
  cuentaNombre: string | null; // nombre de la cuenta (ej: "Clientes")
  esSeleccionable: boolean;
  opcionesCuenta: unknown | null; // JSONB: [{ accountCode, label }]
  pendienteImputacion: boolean;
};

// ------------------------------------------------------------
// Respuesta del preview (antes de persistir)
// ------------------------------------------------------------
export type PreviewResponse = {
  estadoImputacion: "COMPLETO" | "SUSPENSO";
  lineas: ResolvedLine[];
  debeTotal: string;
  haberTotal: string;
};
