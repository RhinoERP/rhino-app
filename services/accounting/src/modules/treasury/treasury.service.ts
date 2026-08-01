import { db } from "../../db/client";
import { AppError } from "../../utils/errors";
import {
  getCuentaById,
  resolveAccountFull,
} from "../accounts/accounts.queries";
import { callCreateJournalEntry } from "../journal/journal.service";
import {
  applyMovementToBalance,
  countPendingItemsForAccount,
  createBankAccount,
  createCashDepositSlip,
  createCheckDepositSlip,
  createIssuedCheck,
  createMovement,
  createReceivedCheck,
  getBankAccountById,
  getIssuedCheckById,
  getReceivedCheckById,
  listMovements,
  toggleBankAccountEstado,
  updateBankAccount,
  updateIssuedCheckEstado,
  updateReceivedCheckEstado,
} from "./treasury.queries";
import type {
  CreateBankAccountInput,
  CreateCashDepositSlipInput,
  CreateCheckDepositSlipInput,
  CreateIssuedCheckInput,
  CreateMovementInput,
  CreateReceivedCheckInput,
  ListMovementsFilters,
  RejectIssuedCheckInput,
  RejectReceivedCheckInput,
  UpdateBankAccountInput,
} from "./treasury.types";

// ── Helper: crea asiento contable de Tesorería con cuentas por account_code ──
// Llama directamente a callCreateJournalEntry sin pasar por el motor de reglas,
// ya que los asientos de Tesorería tienen estructura fija de 2 líneas.

type TreasuryLine = {
  accountCode: string;
  lado: "DEBE" | "HABER";
  importe: string;
  descripcion?: string;
};

async function createTreasuryJournalEntry({
  orgId,
  tipoEvento,
  referenciaId,
  referenciaTabla,
  fecha,
  descripcion,
  idempotencyKey,
  creadoPor,
  lineas,
}: {
  orgId: string;
  tipoEvento: string;
  referenciaId: string;
  referenciaTabla: string;
  fecha: string;
  descripcion: string;
  idempotencyKey: string;
  creadoPor?: string;
  lineas: TreasuryLine[];
}): Promise<string> {
  const resolvedLineas = await Promise.all(
    lineas.map(async (l) => {
      const cuenta = await resolveAccountFull(l.accountCode, orgId);
      if (!cuenta) {
        throw AppError.unprocessable(
          `Cuenta no encontrada para '${l.accountCode}'. Configure el plan de cuentas antes de registrar el asiento.`
        );
      }
      return {
        cuentaId: cuenta.id,
        debe: l.lado === "DEBE" ? l.importe : "0.0000",
        haber: l.lado === "HABER" ? l.importe : "0.0000",
        descripcion: l.descripcion ?? null,
      };
    })
  );

  return callCreateJournalEntry({
    orgId,
    tipoEvento,
    referenciaId,
    referenciaTabla,
    fecha,
    descripcion,
    idempotencyKey,
    creadoPor: creadoPor ?? null,
    lineas: resolvedLineas,
  });
}

/** Resuelve el account_code de la cuenta contable vinculada a una cuenta bancaria */
async function getBankAccountCode(
  cuentaContableId: string,
  orgId: string
): Promise<string> {
  const coa = await getCuentaById(cuentaContableId);
  if (!coa || coa.org_id !== orgId) {
    throw AppError.notFound(
      "La cuenta contable vinculada a la cuenta bancaria no fue encontrada"
    );
  }
  const accountCode = coa.account_code;
  if (!accountCode) {
    throw AppError.unprocessable(
      `La cuenta contable ${coa.codigo} no tiene un account_code semántico configurado`
    );
  }
  return accountCode;
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export async function createBankAccountService(input: CreateBankAccountInput) {
  // Validate that the linked chart-of-accounts entry is ACTIVO + permite_movimientos
  const cuenta = await resolveAccountFull(
    input.cuentaContableId,
    input.orgId
  ).then(() =>
    db
      .selectFrom("accounting.chart_of_accounts")
      .select(["id", "tipo", "permite_movimientos", "activa"])
      .where("id", "=", input.cuentaContableId)
      .where("org_id", "=", input.orgId)
      .executeTakeFirst()
  );

  if (!cuenta) {
    throw AppError.notFound("Cuenta contable no encontrada");
  }
  if (!cuenta.activa) {
    throw AppError.unprocessable("La cuenta contable está inactiva");
  }
  if (!cuenta.permite_movimientos) {
    throw AppError.unprocessable(
      "La cuenta contable no permite movimientos — seleccione una cuenta de movimiento"
    );
  }
  if (cuenta.tipo !== "ACTIVO") {
    throw AppError.unprocessable(
      "La cuenta contable de una cuenta bancaria debe ser de tipo ACTIVO"
    );
  }

  return createBankAccount(input);
}

export async function updateBankAccountService(
  id: string,
  orgId: string,
  input: UpdateBankAccountInput
) {
  const existing = await getBankAccountById(id, orgId);
  if (!existing) {
    throw AppError.notFound(`Cuenta bancaria ${id} no encontrada`);
  }

  // If changing the linked account, validate the new one
  if (input.cuentaContableId) {
    const cuenta = await db
      .selectFrom("accounting.chart_of_accounts")
      .select(["id", "tipo", "permite_movimientos", "activa"])
      .where("id", "=", input.cuentaContableId)
      .where("org_id", "=", orgId)
      .executeTakeFirst();

    if (!cuenta) {
      throw AppError.notFound("Cuenta contable no encontrada");
    }
    if (!cuenta.activa) {
      throw AppError.unprocessable("La cuenta contable está inactiva");
    }
    if (!cuenta.permite_movimientos) {
      throw AppError.unprocessable("La cuenta contable no permite movimientos");
    }
    if (cuenta.tipo !== "ACTIVO") {
      throw AppError.unprocessable(
        "La cuenta contable de una cuenta bancaria debe ser de tipo ACTIVO"
      );
    }
  }

  const updated = await updateBankAccount(id, orgId, input);
  if (!updated) {
    throw AppError.notFound(`Cuenta bancaria ${id} no encontrada`);
  }
  return updated;
}

export async function toggleBankAccountEstadoService(
  id: string,
  orgId: string,
  activa: boolean
) {
  const existing = await getBankAccountById(id, orgId);
  if (!existing) {
    throw AppError.notFound(`Cuenta bancaria ${id} no encontrada`);
  }

  if (!activa) {
    const pending = await countPendingItemsForAccount(id);
    if (pending > 0) {
      throw AppError.unprocessable(
        `No se puede desactivar la cuenta: tiene ${pending} cheque(s) pendiente(s)`
      );
    }
  }

  const updated = await toggleBankAccountEstado(id, orgId, activa);
  if (!updated) {
    throw AppError.notFound(`Cuenta bancaria ${id} no encontrada`);
  }
  return updated;
}

// ── Treasury Movements ────────────────────────────────────────────────────────

export async function createMovementService(input: CreateMovementInput) {
  const cuenta = await getBankAccountById(input.cuentaBancariaId, input.orgId);
  if (!cuenta) {
    throw AppError.notFound("Cuenta bancaria no encontrada");
  }
  if (!cuenta.activa) {
    throw AppError.unprocessable("La cuenta bancaria está inactiva");
  }

  // For manual bank movements (DEBITO_BANCARIO / CREDITO_BANCARIO) we need
  // a counterpart account code to build the journal entry.
  let journalEntryId: string | undefined;
  if (input.tipo === "DEBITO_BANCARIO" || input.tipo === "CREDITO_BANCARIO") {
    if (!input.cuentaContrapartidaCode) {
      throw AppError.badRequest(
        "Se requiere cuentaContrapartidaCode para movimientos bancarios manuales"
      );
    }
    const bankCode = await getBankAccountCode(
      cuenta.cuenta_contable_id,
      input.orgId
    );
    const tipoEvento =
      input.tipo === "DEBITO_BANCARIO"
        ? "MOVIMIENTO_BANCARIO_DEBITO"
        : "MOVIMIENTO_BANCARIO_CREDITO";
    const lineas: TreasuryLine[] =
      input.tipo === "DEBITO_BANCARIO"
        ? [
            {
              accountCode: input.cuentaContrapartidaCode,
              lado: "DEBE",
              importe: input.importe,
            },
            { accountCode: bankCode, lado: "HABER", importe: input.importe },
          ]
        : [
            { accountCode: bankCode, lado: "DEBE", importe: input.importe },
            {
              accountCode: input.cuentaContrapartidaCode,
              lado: "HABER",
              importe: input.importe,
            },
          ];

    journalEntryId = await createTreasuryJournalEntry({
      orgId: input.orgId,
      tipoEvento,
      referenciaId: input.referenciaId ?? crypto.randomUUID(),
      referenciaTabla: "treasury_movements",
      fecha: input.fecha,
      descripcion: input.descripcion,
      idempotencyKey: `${tipoEvento}_${input.cuentaBancariaId}_${input.fecha}_${input.importe}`,
      creadoPor: input.creadoPor,
      lineas,
    });
  }

  const movement = await createMovement({ ...input, journalEntryId });

  // Update operational balance: HABER → +, DEBE → -
  await applyMovementToBalance(
    input.cuentaBancariaId,
    input.orgId,
    input.importe,
    input.lado
  );

  return movement;
}

export function listMovementsService(filters: ListMovementsFilters) {
  return listMovements(filters);
}

// ── Received Checks ───────────────────────────────────────────────────────────

export function createReceivedCheckService(input: CreateReceivedCheckInput) {
  return createReceivedCheck(input);
}

export async function rejectReceivedCheckService(
  id: string,
  orgId: string,
  input: RejectReceivedCheckInput
) {
  const check = await getReceivedCheckById(id, orgId);
  if (!check) {
    throw AppError.notFound(`Cheque recibido ${id} no encontrado`);
  }
  if (check.estado !== "DEPOSITADO") {
    throw AppError.unprocessable(
      "Solo se pueden rechazar cheques en estado DEPOSITADO"
    );
  }

  const cuentaBancaria = await getBankAccountById(
    input.cuentaBancariaId,
    orgId
  );
  if (!cuentaBancaria) {
    throw AppError.notFound("Cuenta bancaria no encontrada");
  }

  const bankCode = await getBankAccountCode(
    cuentaBancaria.cuenta_contable_id,
    orgId
  );
  const contrapartidaCode =
    input.cuentaContrapartidaCode ?? "CHEQUES_RECHAZADOS";

  // 1. Asiento: DEBE contrapartida (normalmente CHEQUES_RECHAZADOS), HABER banco
  const journalEntryId = await createTreasuryJournalEntry({
    orgId,
    tipoEvento: "CHEQUE_RECIBIDO_RECHAZADO",
    referenciaId: id,
    referenciaTabla: "received_checks",
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: `Rechazo cheque ${check.numero_cheque} (—) ${check.banco_emisor}`,
    idempotencyKey: `CHEQUE_RECIBIDO_RECHAZADO_${id}`,
    creadoPor: input.creadoPor,
    lineas: [
      { accountCode: contrapartidaCode, lado: "DEBE", importe: check.importe },
      { accountCode: bankCode, lado: "HABER", importe: check.importe },
    ],
  });

  // 2. Marcar cheque como rechazado
  const updated = await updateReceivedCheckEstado(id, orgId, {
    estado: "RECHAZADO",
    journalEntryId,
  });

  // 3. Revertir el saldo bancario (se depositó HABER, al rechazar DEBE)
  await createMovementService({
    orgId,
    cuentaBancariaId: input.cuentaBancariaId,
    tipo: "CHEQUE_RECIBIDO_RECHAZADO",
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: `Rechazo cheque ${check.numero_cheque} — ${check.banco_emisor}`,
    importe: check.importe,
    lado: "DEBE",
    referenciaId: id,
    referenciaTabla: "received_checks",
    journalEntryId,
    creadoPor: input.creadoPor,
  });

  return updated;
}

// ── Issued Checks ─────────────────────────────────────────────────────────────

export async function createIssuedCheckService(input: CreateIssuedCheckInput) {
  // Validate the bank account exists and belongs to the org
  const cuenta = await getBankAccountById(input.cuentaBancariaId, input.orgId);
  if (!cuenta) {
    throw AppError.notFound("Cuenta bancaria no encontrada");
  }

  return createIssuedCheck(input);
}

export async function debitIssuedCheckService(
  id: string,
  orgId: string,
  creadoPor?: string
) {
  const check = await getIssuedCheckById(id, orgId);
  if (!check) {
    throw AppError.notFound(`Cheque emitido ${id} no encontrado`);
  }
  if (check.estado !== "EMITIDO") {
    throw AppError.unprocessable(
      "Solo se pueden debitar cheques en estado EMITIDO"
    );
  }

  const cuentaBancaria = await getBankAccountById(
    check.cuenta_bancaria_id,
    orgId
  );
  if (!cuentaBancaria) {
    throw AppError.notFound("Cuenta bancaria no encontrada");
  }
  const bankCode = await getBankAccountCode(
    cuentaBancaria.cuenta_contable_id,
    orgId
  );

  // 1. Asiento: DEBE VALORES_A_PAGAR, HABER banco
  const journalEntryId = await createTreasuryJournalEntry({
    orgId,
    tipoEvento: "DEBITO_CHEQUE_PROPIO",
    referenciaId: id,
    referenciaTabla: "issued_checks",
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: `Débito cheque propio ${check.numero_cheque} — ${check.beneficiario}`,
    idempotencyKey: `DEBITO_CHEQUE_PROPIO_${id}`,
    creadoPor,
    lineas: [
      { accountCode: "VALORES_A_PAGAR", lado: "DEBE", importe: check.importe },
      { accountCode: bankCode, lado: "HABER", importe: check.importe },
    ],
  });

  // 2. Marcar cheque como debitado
  const updated = await updateIssuedCheckEstado(id, orgId, {
    estado: "DEBITADO",
    journalEntryId,
  });

  // 3. Actualizar saldo bancario (DEBE = saldo baja)
  await createMovementService({
    orgId,
    cuentaBancariaId: check.cuenta_bancaria_id,
    tipo: "DEBITO_CHEQUE_PROPIO",
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: `Débito cheque propio ${check.numero_cheque} — ${check.beneficiario}`,
    importe: check.importe,
    lado: "DEBE",
    referenciaId: id,
    referenciaTabla: "issued_checks",
    journalEntryId,
    creadoPor,
  });

  return updated;
}

export async function rejectIssuedCheckService(
  id: string,
  orgId: string,
  input: RejectIssuedCheckInput
) {
  const check = await getIssuedCheckById(id, orgId);
  if (!check) {
    throw AppError.notFound(`Cheque emitido ${id} no encontrado`);
  }
  if (check.estado !== "EMITIDO") {
    throw AppError.unprocessable(
      "Solo se pueden rechazar cheques en estado EMITIDO"
    );
  }

  const cuentaBancaria = await getBankAccountById(
    check.cuenta_bancaria_id,
    orgId
  );
  if (!cuentaBancaria) {
    throw AppError.notFound("Cuenta bancaria no encontrada");
  }
  const bankCode = await getBankAccountCode(
    cuentaBancaria.cuenta_contable_id,
    orgId
  );

  // 1. Asiento: DEBE banco, HABER contrapartida (elegida por usuario)
  const journalEntryId = await createTreasuryJournalEntry({
    orgId,
    tipoEvento: "CHEQUE_PROPIO_RECHAZADO",
    referenciaId: id,
    referenciaTabla: "issued_checks",
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: `Rechazo cheque propio ${check.numero_cheque} — ${check.beneficiario}`,
    idempotencyKey: `CHEQUE_PROPIO_RECHAZADO_${id}`,
    creadoPor: input.creadoPor,
    lineas: [
      { accountCode: bankCode, lado: "DEBE", importe: check.importe },
      {
        accountCode: input.cuentaContrapartidaCode,
        lado: "HABER",
        importe: check.importe,
      },
    ],
  });

  // 2. Marcar cheque como rechazado
  const updated = await updateIssuedCheckEstado(id, orgId, {
    estado: "RECHAZADO",
    journalEntryId,
  });

  return updated;
}

// ── Deposit Slips ─────────────────────────────────────────────────────────────

export async function createCheckDepositSlipService(
  input: CreateCheckDepositSlipInput
) {
  if (input.checkIds.length === 0) {
    throw AppError.badRequest(
      "Debe seleccionar al menos un cheque para depositar"
    );
  }

  const cuenta = await getBankAccountById(input.cuentaBancariaId, input.orgId);
  if (!cuenta) {
    throw AppError.notFound("Cuenta bancaria no encontrada");
  }

  // Fetch checks, validate all EN_CARTERA and belong to the org
  const checks = await Promise.all(
    input.checkIds.map((cid) => getReceivedCheckById(cid, input.orgId))
  );

  const notFound = checks.indexOf(undefined);
  if (notFound >= 0) {
    throw AppError.notFound(`Cheque ${input.checkIds[notFound]} no encontrado`);
  }

  const notInCartera = (checks as NonNullable<(typeof checks)[0]>[]).find(
    (c) => c.estado !== "EN_CARTERA"
  );
  if (notInCartera) {
    throw AppError.unprocessable(
      `El cheque ${notInCartera.numero_cheque} no está EN_CARTERA (estado: ${notInCartera.estado})`
    );
  }

  const validChecks = checks as NonNullable<(typeof checks)[0]>[];

  // 1. Create slip + link checks in a transaction
  const slip = await createCheckDepositSlip(
    input,
    validChecks.map((c) => ({ id: c.id, importe: c.importe }))
  );

  // 2. Mark each check as DEPOSITADO
  await Promise.all(
    validChecks.map((c) =>
      updateReceivedCheckEstado(c.id, input.orgId, {
        estado: "DEPOSITADO",
        depositSlipId: slip.id,
      })
    )
  );

  const total = validChecks
    .reduce((acc, c) => acc + Number.parseFloat(c.importe), 0)
    .toFixed(4);

  // 3. Asiento contable: DEBE banco, HABER VALORES_A_DEPOSITAR
  const bankCode = await getBankAccountCode(
    cuenta.cuenta_contable_id,
    input.orgId
  );
  const journalEntryId = await createTreasuryJournalEntry({
    orgId: input.orgId,
    tipoEvento: "DEPOSITO_CHEQUES",
    referenciaId: slip.id,
    referenciaTabla: "treasury_deposit_slips",
    fecha: input.fecha,
    descripcion: input.descripcion,
    idempotencyKey: `DEPOSITO_CHEQUES_${slip.id}`,
    creadoPor: input.creadoPor,
    lineas: [
      { accountCode: bankCode, lado: "DEBE", importe: total },
      { accountCode: "VALORES_A_DEPOSITAR", lado: "HABER", importe: total },
    ],
  });

  // 4. Movimiento operativo (acredita saldo)
  await createMovementService({
    orgId: input.orgId,
    cuentaBancariaId: input.cuentaBancariaId,
    tipo: "DEPOSITO_CHEQUES",
    fecha: input.fecha,
    descripcion: input.descripcion,
    importe: total,
    lado: "HABER",
    referenciaId: slip.id,
    referenciaTabla: "treasury_deposit_slips",
    journalEntryId,
    creadoPor: input.creadoPor,
  });

  return slip;
}

export async function createCashDepositSlipService(
  input: CreateCashDepositSlipInput
) {
  const cuenta = await getBankAccountById(input.cuentaBancariaId, input.orgId);
  if (!cuenta) {
    throw AppError.notFound("Cuenta bancaria no encontrada");
  }

  const slip = await createCashDepositSlip(input);

  // 1. Asiento contable: DEBE banco, HABER caja (input.cuentaCajaCode)
  const bankCode = await getBankAccountCode(
    cuenta.cuenta_contable_id,
    input.orgId
  );
  const journalEntryId = await createTreasuryJournalEntry({
    orgId: input.orgId,
    tipoEvento: "DEPOSITO_EFECTIVO",
    referenciaId: slip.id,
    referenciaTabla: "treasury_deposit_slips",
    fecha: input.fecha,
    descripcion: input.descripcion,
    idempotencyKey: `DEPOSITO_EFECTIVO_${slip.id}`,
    creadoPor: input.creadoPor,
    lineas: [
      { accountCode: bankCode, lado: "DEBE", importe: input.importe },
      {
        accountCode: input.cuentaCajaCode,
        lado: "HABER",
        importe: input.importe,
      },
    ],
  });

  // 2. Movimiento operativo (acredita saldo)
  await createMovementService({
    orgId: input.orgId,
    cuentaBancariaId: input.cuentaBancariaId,
    tipo: "DEPOSITO_EFECTIVO",
    fecha: input.fecha,
    descripcion: input.descripcion,
    importe: input.importe,
    lado: "HABER",
    referenciaId: slip.id,
    referenciaTabla: "treasury_deposit_slips",
    journalEntryId,
    creadoPor: input.creadoPor,
  });

  return slip;
}
