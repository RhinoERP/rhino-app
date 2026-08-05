import Decimal from "decimal.js";
import { type Kysely, sql, type Transaction } from "kysely";
import { db } from "../../db/client";
import type {
  Database,
  IssuedCheck,
  NewPublicPayablePayment,
  NewPublicSupplierCreditApplication,
  NewReceivedCheckEndorsement,
  PublicAccountsPayable,
  PublicPayablePayment,
  PublicSupplierCredit,
  ReceivedCheck,
  ReceivedCheckEndorsement,
  ReceivedCheckEstado,
  TreasuryBankAccount,
  TreasuryDepositSlip,
  TreasuryMovement,
  UpdateTreasuryBankAccount,
} from "../../db/types";
import type {
  CreateBankAccountInput,
  CreateCashDepositSlipInput,
  CreateCheckDepositSlipInput,
  CreateIssuedCheckInput,
  CreateMovementInput,
  CreateReceivedCheckInput,
  DepositSlipWithChecks,
  ListMovementsFilters,
  UpdateBankAccountInput,
  UpdateIssuedCheckEstadoInput,
  UpdateReceivedCheckEstadoInput,
} from "./treasury.types";

export type DbExecutor = Kysely<Database> | Transaction<Database>;

const resolveExecutor = (executor?: DbExecutor): DbExecutor => executor ?? db;

export function listBankAccounts(
  orgId: string,
  soloActivas?: boolean
): Promise<TreasuryBankAccount[]> {
  let query = db
    .selectFrom("accounting.treasury_bank_accounts")
    .selectAll()
    .where("org_id", "=", orgId)
    .orderBy("nombre", "asc");

  if (soloActivas === true) {
    query = query.where("activa", "=", true);
  }

  return query.execute();
}

export function getBankAccountById(
  id: string,
  orgId: string,
  executor?: DbExecutor
): Promise<TreasuryBankAccount | undefined> {
  return resolveExecutor(executor)
    .selectFrom("accounting.treasury_bank_accounts")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();
}

export function getBankAccountByIdForUpdate(
  id: string,
  orgId: string,
  executor: DbExecutor
): Promise<TreasuryBankAccount | undefined> {
  return executor
    .selectFrom("accounting.treasury_bank_accounts")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .forUpdate()
    .executeTakeFirst();
}

export function createBankAccount(
  input: CreateBankAccountInput,
  executor?: DbExecutor
): Promise<TreasuryBankAccount> {
  return resolveExecutor(executor)
    .insertInto("accounting.treasury_bank_accounts")
    .values({
      org_id: input.orgId,
      nombre: input.nombre,
      banco: input.banco,
      moneda: input.moneda,
      cuenta_contable_id: input.cuentaContableId,
      numero_cuenta: input.numerosCuenta ?? null,
      alias: input.alias ?? null,
      descripcion: input.descripcion ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function updateBankAccount(
  id: string,
  orgId: string,
  input: UpdateBankAccountInput,
  executor?: DbExecutor
): Promise<TreasuryBankAccount | undefined> {
  const patch: UpdateTreasuryBankAccount = {};

  if (input.nombre !== undefined) {
    patch.nombre = input.nombre;
  }
  if (input.banco !== undefined) {
    patch.banco = input.banco;
  }
  if (input.moneda !== undefined) {
    patch.moneda = input.moneda;
  }
  if (input.cuentaContableId !== undefined) {
    patch.cuenta_contable_id = input.cuentaContableId;
  }
  if (input.numerosCuenta !== undefined) {
    patch.numero_cuenta = input.numerosCuenta;
  }
  if (input.alias !== undefined) {
    patch.alias = input.alias;
  }
  if (input.descripcion !== undefined) {
    patch.descripcion = input.descripcion;
  }

  return resolveExecutor(executor)
    .updateTable("accounting.treasury_bank_accounts")
    .set(patch)
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .returningAll()
    .executeTakeFirst();
}

export function toggleBankAccountEstado(
  id: string,
  orgId: string,
  activa: boolean,
  executor?: DbExecutor
): Promise<TreasuryBankAccount | undefined> {
  return resolveExecutor(executor)
    .updateTable("accounting.treasury_bank_accounts")
    .set({ activa })
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .returningAll()
    .executeTakeFirst();
}

export async function countPendingItemsForAccount(
  cuentaBancariaId: string,
  executor?: DbExecutor
): Promise<number> {
  const scopedDb = resolveExecutor(executor);
  const result = await scopedDb
    .selectFrom("accounting.issued_checks")
    .select(scopedDb.fn.count("id").as("cnt"))
    .where("cuenta_bancaria_id", "=", cuentaBancariaId)
    .where("estado", "=", "EMITIDO")
    .executeTakeFirst();

  return Number(result?.cnt ?? 0);
}

export function listMovements(
  filters: ListMovementsFilters
): Promise<TreasuryMovement[]> {
  let query = db
    .selectFrom("accounting.treasury_movements")
    .selectAll()
    .where("org_id", "=", filters.orgId)
    .where("estado", "=", "ACTIVO");

  if (filters.cuentaId) {
    query = query.where("cuenta_bancaria_id", "=", filters.cuentaId);
  }
  if (filters.desde) {
    query = query.where("fecha", ">=", filters.desde as unknown as Date);
  }
  if (filters.hasta) {
    query = query.where("fecha", "<=", filters.hasta as unknown as Date);
  }
  if (filters.tipo) {
    query = query.where("tipo", "=", filters.tipo);
  }

  return query.orderBy("fecha", "desc").execute();
}

export function getMovementById(
  id: string,
  orgId: string,
  executor?: DbExecutor
): Promise<TreasuryMovement | undefined> {
  return resolveExecutor(executor)
    .selectFrom("accounting.treasury_movements")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();
}

export function createMovement(
  input: CreateMovementInput,
  operationId: string,
  executor?: DbExecutor
): Promise<TreasuryMovement> {
  return resolveExecutor(executor)
    .insertInto("accounting.treasury_movements")
    .values({
      org_id: input.orgId,
      operation_id: operationId,
      cuenta_bancaria_id: input.cuentaBancariaId,
      tipo: input.tipo,
      fecha: input.fecha,
      descripcion: input.descripcion,
      importe: input.importe,
      lado: input.lado,
      journal_entry_id: input.journalEntryId ?? null,
      referencia_id: input.referenciaId ?? null,
      referencia_tabla: input.referenciaTabla ?? null,
      creado_por: input.creadoPor ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function applyMovementToBalance(options: {
  cuentaBancariaId: string;
  orgId: string;
  importe: string;
  lado: "DEBE" | "HABER";
  executor?: DbExecutor;
}): Promise<void> {
  const amount = new Decimal(options.importe);
  const delta = options.lado === "HABER" ? amount : amount.neg();
  const deltaStr = delta.toFixed(4);

  await resolveExecutor(options.executor)
    .updateTable("accounting.treasury_bank_accounts")
    .set({
      saldo_operativo: sql<string>`saldo_operativo + ${sql.raw(deltaStr)}`,
    })
    .where("id", "=", options.cuentaBancariaId)
    .where("org_id", "=", options.orgId)
    .execute();
}

export function listReceivedChecks(
  orgId: string,
  estado?: ReceivedCheckEstado
): Promise<ReceivedCheck[]> {
  let query = db
    .selectFrom("accounting.received_checks")
    .selectAll()
    .where("org_id", "=", orgId);

  if (estado) {
    query = query.where("estado", "=", estado);
  }

  return query.orderBy("fecha_vencimiento", "asc").execute();
}

export function getReceivedCheckById(
  id: string,
  orgId: string,
  executor?: DbExecutor
): Promise<ReceivedCheck | undefined> {
  return resolveExecutor(executor)
    .selectFrom("accounting.received_checks")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();
}

export function listReceivedChecksByIds(
  ids: string[],
  orgId: string,
  executor?: DbExecutor
): Promise<ReceivedCheck[]> {
  return resolveExecutor(executor)
    .selectFrom("accounting.received_checks")
    .selectAll()
    .where("org_id", "=", orgId)
    .where("id", "in", ids)
    .orderBy("id", "asc")
    .execute();
}

export function getReceivedCheckByIdForUpdate(
  id: string,
  orgId: string,
  executor: DbExecutor
): Promise<ReceivedCheck | undefined> {
  return executor
    .selectFrom("accounting.received_checks")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .forUpdate()
    .executeTakeFirst();
}

export function listReceivedChecksByIdsForUpdate(
  ids: string[],
  orgId: string,
  executor: DbExecutor
): Promise<ReceivedCheck[]> {
  return executor
    .selectFrom("accounting.received_checks")
    .selectAll()
    .where("org_id", "=", orgId)
    .where("id", "in", ids)
    .orderBy("id", "asc")
    .forUpdate()
    .execute();
}

export function createReceivedCheck(
  input: CreateReceivedCheckInput,
  operationId: string,
  executor?: DbExecutor
): Promise<ReceivedCheck> {
  return resolveExecutor(executor)
    .insertInto("accounting.received_checks")
    .values({
      org_id: input.orgId,
      operation_id: operationId,
      numero_cheque: input.numeroCheque,
      banco_emisor: input.bancoEmisor,
      importe: input.importe,
      fecha_emision: input.fechaEmision,
      fecha_vencimiento: input.fechaVencimiento,
      tipo: input.tipo ?? "CDF",
      librador: input.librador ?? null,
      librador_id: input.libradorId ?? null,
      notas: input.notas ?? null,
      creado_por: input.creadoPor ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function updateReceivedCheckEstado(
  id: string,
  orgId: string,
  input: UpdateReceivedCheckEstadoInput,
  executor?: DbExecutor
): Promise<ReceivedCheck | undefined> {
  return resolveExecutor(executor)
    .updateTable("accounting.received_checks")
    .set({
      estado: input.estado,
      deposit_slip_id: input.depositSlipId ?? undefined,
      journal_entry_id: input.journalEntryId ?? undefined,
    })
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .returningAll()
    .executeTakeFirst();
}

export function listReceivedCheckEndorsementsByCheckIds(
  receivedCheckIds: string[],
  orgId: string,
  executor?: DbExecutor
): Promise<ReceivedCheckEndorsement[]> {
  return resolveExecutor(executor)
    .selectFrom("accounting.received_check_endorsements")
    .selectAll()
    .where("org_id", "=", orgId)
    .where("received_check_id", "in", receivedCheckIds)
    .execute();
}

export function listReceivedCheckEndorsementsByPaymentId(
  payablePaymentId: string,
  orgId: string,
  executor?: DbExecutor
): Promise<ReceivedCheckEndorsement[]> {
  return resolveExecutor(executor)
    .selectFrom("accounting.received_check_endorsements")
    .selectAll()
    .where("org_id", "=", orgId)
    .where("payable_payment_id", "=", payablePaymentId)
    .orderBy("created_at", "asc")
    .execute();
}

export function createReceivedCheckEndorsements(
  values: NewReceivedCheckEndorsement[],
  executor: DbExecutor
): Promise<ReceivedCheckEndorsement[]> {
  return executor
    .insertInto("accounting.received_check_endorsements")
    .values(values)
    .returningAll()
    .execute();
}

export function getPayableAccountByIdForUpdate(
  id: string,
  orgId: string,
  executor: DbExecutor
): Promise<PublicAccountsPayable | undefined> {
  return executor
    .selectFrom("public.accounts_payable")
    .selectAll()
    .where("id", "=", id)
    .where("organization_id", "=", orgId)
    .forUpdate()
    .executeTakeFirst();
}

export function updatePayableAccountBalance(
  id: string,
  orgId: string,
  input: {
    pendingBalance: string;
    status: string;
  },
  executor: DbExecutor
): Promise<PublicAccountsPayable | undefined> {
  return executor
    .updateTable("public.accounts_payable")
    .set({
      pending_balance: input.pendingBalance,
      status: input.status,
    })
    .where("id", "=", id)
    .where("organization_id", "=", orgId)
    .returningAll()
    .executeTakeFirst();
}

export function listSupplierCreditsForUpdate(
  orgId: string,
  supplierId: string,
  executor: DbExecutor
): Promise<PublicSupplierCredit[]> {
  return executor
    .selectFrom("public.supplier_credits")
    .selectAll()
    .where("organization_id", "=", orgId)
    .where("supplier_id", "=", supplierId)
    .where("remaining_amount", ">", "0")
    .orderBy("created_at", "asc")
    .forUpdate()
    .execute();
}

export function updateSupplierCreditRemainingAmount(
  id: string,
  orgId: string,
  remainingAmount: string,
  executor: DbExecutor
): Promise<PublicSupplierCredit | undefined> {
  return executor
    .updateTable("public.supplier_credits")
    .set({
      remaining_amount: remainingAmount,
      updated_at: sql<string>`NOW()`,
    })
    .where("id", "=", id)
    .where("organization_id", "=", orgId)
    .returningAll()
    .executeTakeFirst();
}

export async function createSupplierCreditApplications(
  values: NewPublicSupplierCreditApplication[],
  executor: DbExecutor
): Promise<void> {
  if (values.length === 0) {
    return;
  }

  await executor
    .insertInto("public.supplier_credit_applications")
    .values(values)
    .execute();
}

export function createPayablePayment(
  input: NewPublicPayablePayment,
  executor: DbExecutor
): Promise<PublicPayablePayment> {
  return executor
    .insertInto("public.payable_payments")
    .values(input)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function getPayablePaymentById(
  id: string,
  orgId: string,
  executor?: DbExecutor
): Promise<PublicPayablePayment | undefined> {
  return resolveExecutor(executor)
    .selectFrom("public.payable_payments")
    .selectAll()
    .where("id", "=", id)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();
}

export function listIssuedChecks(
  orgId: string,
  estado?: string
): Promise<IssuedCheck[]> {
  let query = db
    .selectFrom("accounting.issued_checks")
    .selectAll()
    .where("org_id", "=", orgId);

  if (estado) {
    query = query.where("estado", "=", estado as IssuedCheck["estado"]);
  }

  return query.orderBy("fecha_debito", "asc").execute();
}

export function getIssuedCheckById(
  id: string,
  orgId: string,
  executor?: DbExecutor
): Promise<IssuedCheck | undefined> {
  return resolveExecutor(executor)
    .selectFrom("accounting.issued_checks")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();
}

export function getIssuedCheckByIdForUpdate(
  id: string,
  orgId: string,
  executor: DbExecutor
): Promise<IssuedCheck | undefined> {
  return executor
    .selectFrom("accounting.issued_checks")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .forUpdate()
    .executeTakeFirst();
}

export function createIssuedCheck(
  input: CreateIssuedCheckInput,
  operationId: string,
  executor?: DbExecutor
): Promise<IssuedCheck> {
  return resolveExecutor(executor)
    .insertInto("accounting.issued_checks")
    .values({
      org_id: input.orgId,
      operation_id: operationId,
      cuenta_bancaria_id: input.cuentaBancariaId,
      numero_cheque: input.numeroCheque,
      importe: input.importe,
      fecha_emision: input.fechaEmision,
      fecha_debito: input.fechaDebito,
      beneficiario: input.beneficiario,
      tipo: input.tipo ?? "CDF",
      beneficiario_id: input.beneficiarioId ?? null,
      notas: input.notas ?? null,
      referencia_pago_id: input.referenciaPagoId ?? null,
      referencia_pago_tabla: input.referenciaPagoTabla ?? null,
      creado_por: input.creadoPor ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function updateIssuedCheckEstado(
  id: string,
  orgId: string,
  input: UpdateIssuedCheckEstadoInput,
  executor?: DbExecutor
): Promise<IssuedCheck | undefined> {
  return resolveExecutor(executor)
    .updateTable("accounting.issued_checks")
    .set({
      estado: input.estado,
      journal_entry_id: input.journalEntryId ?? undefined,
    })
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .returningAll()
    .executeTakeFirst();
}

export function listDepositSlips(
  orgId: string,
  cuentaId?: string
): Promise<TreasuryDepositSlip[]> {
  let query = db
    .selectFrom("accounting.treasury_deposit_slips")
    .selectAll()
    .where("org_id", "=", orgId);

  if (cuentaId) {
    query = query.where("cuenta_bancaria_id", "=", cuentaId);
  }

  return query.orderBy("fecha", "desc").execute();
}

export async function getDepositSlipWithChecks(
  id: string,
  orgId: string,
  executor?: DbExecutor
): Promise<DepositSlipWithChecks | undefined> {
  const scopedDb = resolveExecutor(executor);
  const slip = await scopedDb
    .selectFrom("accounting.treasury_deposit_slips")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();

  if (!slip) {
    return;
  }

  const checks = await scopedDb
    .selectFrom("accounting.treasury_deposit_slip_checks")
    .selectAll()
    .where("deposit_slip_id", "=", id)
    .execute();

  return {
    id: slip.id,
    orgId: slip.org_id,
    cuentaBancariaId: slip.cuenta_bancaria_id,
    tipo: slip.tipo,
    fecha: slip.fecha,
    importeTotal: slip.importe_total,
    descripcion: slip.descripcion,
    cuentaCajaCode: slip.cuenta_caja_code,
    journalEntryId: slip.journal_entry_id,
    estado: slip.estado,
    creadoPor: slip.creado_por,
    creadoAt: slip.creado_at,
    checks: checks.map((check) => ({
      id: check.id,
      checkId: check.check_id,
      importe: check.importe,
    })),
  };
}

export function createCheckDepositSlip(
  input: CreateCheckDepositSlipInput,
  checks: Array<{ id: string; importe: string }>,
  operationId: string,
  executor?: DbExecutor
): Promise<TreasuryDepositSlip> {
  const total = checks
    .reduce(
      (acc, check) => acc.plus(new Decimal(check.importe)),
      new Decimal(0)
    )
    .toFixed(4);

  return resolveExecutor(executor)
    .insertInto("accounting.treasury_deposit_slips")
    .values({
      org_id: input.orgId,
      operation_id: operationId,
      cuenta_bancaria_id: input.cuentaBancariaId,
      tipo: "CHEQUES",
      fecha: input.fecha,
      importe_total: total,
      descripcion: input.descripcion,
      creado_por: input.creadoPor ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
    .then(async (slip) => {
      if (checks.length > 0) {
        await resolveExecutor(executor)
          .insertInto("accounting.treasury_deposit_slip_checks")
          .values(
            checks.map((check) => ({
              deposit_slip_id: slip.id,
              check_id: check.id,
              importe: check.importe,
            }))
          )
          .execute();
      }

      return slip;
    });
}

export function createCashDepositSlip(
  input: CreateCashDepositSlipInput,
  operationId: string,
  executor?: DbExecutor
): Promise<TreasuryDepositSlip> {
  return resolveExecutor(executor)
    .insertInto("accounting.treasury_deposit_slips")
    .values({
      org_id: input.orgId,
      operation_id: operationId,
      cuenta_bancaria_id: input.cuentaBancariaId,
      tipo: "EFECTIVO",
      fecha: input.fecha,
      importe_total: input.importe,
      descripcion: input.descripcion,
      cuenta_caja_code: input.cuentaCajaCode,
      creado_por: input.creadoPor ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
