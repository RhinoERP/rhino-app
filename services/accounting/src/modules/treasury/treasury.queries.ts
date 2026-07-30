import Decimal from "decimal.js";
import { sql } from "kysely";
import { db } from "../../db/client";
import type {
  IssuedCheck,
  ReceivedCheck,
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

// ── Bank Accounts ─────────────────────────────────────────────────────────────

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
  orgId: string
): Promise<TreasuryBankAccount | undefined> {
  return db
    .selectFrom("accounting.treasury_bank_accounts")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();
}

export function createBankAccount(
  input: CreateBankAccountInput
): Promise<TreasuryBankAccount> {
  return db
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
  input: UpdateBankAccountInput
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

  return db
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
  activa: boolean
): Promise<TreasuryBankAccount | undefined> {
  return db
    .updateTable("accounting.treasury_bank_accounts")
    .set({ activa })
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .returningAll()
    .executeTakeFirst();
}

/** Counts checks EN_CARTERA or EMITIDO linked to this bank account — used to
 *  validate that it is safe to deactivate. */
export async function countPendingItemsForAccount(
  cuentaBancariaId: string
): Promise<number> {
  const [rcResult, icResult] = await Promise.all([
    db
      .selectFrom("accounting.received_checks")
      .select(db.fn.count("id").as("cnt"))
      .where("deposit_slip_id", "is not", null)
      .executeTakeFirst(),
    db
      .selectFrom("accounting.issued_checks")
      .select(db.fn.count("id").as("cnt"))
      .where("cuenta_bancaria_id", "=", cuentaBancariaId)
      .where("estado", "=", "EMITIDO")
      .executeTakeFirst(),
  ]);

  return Number(rcResult?.cnt ?? 0) + Number(icResult?.cnt ?? 0);
}

// ── Treasury Movements ────────────────────────────────────────────────────────

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

export function createMovement(
  input: CreateMovementInput
): Promise<TreasuryMovement> {
  return db
    .insertInto("accounting.treasury_movements")
    .values({
      org_id: input.orgId,
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

/** Updates the saldo_operativo of a bank account by applying the movement's
 *  amount with the correct sign: HABER increases the balance (credit),
 *  DEBE decreases it (debit). */
export async function applyMovementToBalance(
  cuentaBancariaId: string,
  orgId: string,
  importe: string,
  lado: "DEBE" | "HABER"
): Promise<void> {
  const amount = new Decimal(importe);
  const delta = lado === "HABER" ? amount : amount.neg();
  const deltaStr = delta.toFixed(4);

  await db
    .updateTable("accounting.treasury_bank_accounts")
    .set({
      saldo_operativo: sql<string>`saldo_operativo + ${sql.raw(deltaStr)}`,
    })
    .where("id", "=", cuentaBancariaId)
    .where("org_id", "=", orgId)
    .execute();
}

// ── Received Checks ───────────────────────────────────────────────────────────

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
  orgId: string
): Promise<ReceivedCheck | undefined> {
  return db
    .selectFrom("accounting.received_checks")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();
}

export function createReceivedCheck(
  input: CreateReceivedCheckInput
): Promise<ReceivedCheck> {
  return db
    .insertInto("accounting.received_checks")
    .values({
      org_id: input.orgId,
      numero_cheque: input.numeroCheque,
      banco_emisor: input.bancoEmisor,
      importe: input.importe,
      fecha_emision: input.fechaEmision,
      fecha_vencimiento: input.fechaVencimiento,
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
  input: UpdateReceivedCheckEstadoInput
): Promise<ReceivedCheck | undefined> {
  return db
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

// ── Issued Checks ─────────────────────────────────────────────────────────────

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
  orgId: string
): Promise<IssuedCheck | undefined> {
  return db
    .selectFrom("accounting.issued_checks")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();
}

export function createIssuedCheck(
  input: CreateIssuedCheckInput
): Promise<IssuedCheck> {
  return db
    .insertInto("accounting.issued_checks")
    .values({
      org_id: input.orgId,
      cuenta_bancaria_id: input.cuentaBancariaId,
      numero_cheque: input.numeroCheque,
      importe: input.importe,
      fecha_emision: input.fechaEmision,
      fecha_debito: input.fechaDebito,
      beneficiario: input.beneficiario,
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
  input: UpdateIssuedCheckEstadoInput
): Promise<IssuedCheck | undefined> {
  return db
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

// ── Deposit Slips ─────────────────────────────────────────────────────────────

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
  orgId: string
): Promise<DepositSlipWithChecks | undefined> {
  const slip = await db
    .selectFrom("accounting.treasury_deposit_slips")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();

  if (!slip) {
    return;
  }

  const checks = await db
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
    checks: checks.map((c) => ({
      id: c.id,
      checkId: c.check_id,
      importe: c.importe,
    })),
  };
}

export function createCheckDepositSlip(
  input: CreateCheckDepositSlipInput,
  checks: Array<{ id: string; importe: string }>
): Promise<TreasuryDepositSlip> {
  const total = checks
    .reduce((acc, c) => acc.plus(new Decimal(c.importe)), new Decimal(0))
    .toFixed(4);

  return db.transaction().execute(async (trx) => {
    const slip = await trx
      .insertInto("accounting.treasury_deposit_slips")
      .values({
        org_id: input.orgId,
        cuenta_bancaria_id: input.cuentaBancariaId,
        tipo: "CHEQUES",
        fecha: input.fecha,
        importe_total: total,
        descripcion: input.descripcion,
        creado_por: input.creadoPor ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (checks.length > 0) {
      await trx
        .insertInto("accounting.treasury_deposit_slip_checks")
        .values(
          checks.map((c) => ({
            deposit_slip_id: slip.id,
            check_id: c.id,
            importe: c.importe,
          }))
        )
        .execute();
    }

    return slip;
  });
}

export function createCashDepositSlip(
  input: CreateCashDepositSlipInput
): Promise<TreasuryDepositSlip> {
  return db
    .insertInto("accounting.treasury_deposit_slips")
    .values({
      org_id: input.orgId,
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
