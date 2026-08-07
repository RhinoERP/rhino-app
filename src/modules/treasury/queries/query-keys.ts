import type {
  IssuedCheckEstado,
  ReceivedCheckEstado,
  TreasuryMovementTipo,
} from "@/lib/accounting-client";

export const treasuryQueryKeys = {
  // Cuentas bancarias
  cuentasBancarias: (orgId: string, soloActivas?: boolean) =>
    ["treasury", "bank-accounts", orgId, soloActivas] as const,
  cuentaBancaria: (orgId: string, id: string) =>
    ["treasury", "bank-account", orgId, id] as const,

  // Movimientos
  movimientos: (
    orgId: string,
    filters: {
      cuentaId?: string;
      desde?: string;
      hasta?: string;
      tipo?: TreasuryMovementTipo;
    }
  ) => ["treasury", "movements", orgId, filters] as const,

  // Cheques recibidos
  chequesRecibidos: (orgId: string, estado?: ReceivedCheckEstado) =>
    ["treasury", "received-checks", orgId, estado] as const,
  chequeRecibido: (orgId: string, id: string) =>
    ["treasury", "received-check", orgId, id] as const,

  // Cheques emitidos
  chequesEmitidos: (orgId: string, estado?: IssuedCheckEstado) =>
    ["treasury", "issued-checks", orgId, estado] as const,
  chequeEmitido: (orgId: string, id: string) =>
    ["treasury", "issued-check", orgId, id] as const,

  // Boletas de depósito
  boletas: (orgId: string, cuentaId?: string) =>
    ["treasury", "deposit-slips", orgId, cuentaId] as const,
} as const;
