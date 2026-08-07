// Re-export los tipos del cliente para uso en el módulo.
// Los tipos de dominio de Tesorería viven en accounting-client.ts junto con
// los wrappers fetch, para mantener consistencia con el módulo contable.
export type {
  CreateBankAccountInput,
  CreateCashDepositSlipInput,
  CreateCheckDepositSlipInput,
  CreateIssuedCheckInput,
  CreateMovimientoBancarioInput,
  CreateReceivedCheckInput,
  DepositSlipEstado,
  DepositSlipTipo,
  IssuedCheck,
  IssuedCheckEstado,
  ReceivedCheck,
  ReceivedCheckEstado,
  TreasuryBankAccount,
  TreasuryDepositSlip,
  TreasuryMovement,
  TreasuryMovementTipo,
  UpdateBankAccountInput,
} from "@/lib/accounting-client";
