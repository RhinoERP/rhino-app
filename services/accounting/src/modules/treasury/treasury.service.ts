import { db } from "../../db/client";
import { AppError } from "../../utils/errors";
import { resolveAccountFull } from "../accounts/accounts.queries";
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
  UpdateBankAccountInput,
} from "./treasury.types";

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

  const movement = await createMovement(input);

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
  cuentaBancariaId: string,
  creadoPor?: string
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

  // Mark check as rejected
  const updated = await updateReceivedCheckEstado(id, orgId, {
    estado: "RECHAZADO",
  });

  // Reverse the deposit balance impact:
  // When deposited the account was credited (HABER), rejection debits it back
  await createMovementService({
    orgId,
    cuentaBancariaId,
    tipo: "CHEQUE_RECIBIDO_RECHAZADO",
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: `Rechazo cheque ${check.numero_cheque} — ${check.banco_emisor}`,
    importe: check.importe,
    lado: "DEBE",
    referenciaId: id,
    referenciaTabla: "received_checks",
    creadoPor,
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

  // Mark check as debited
  const updated = await updateIssuedCheckEstado(id, orgId, {
    estado: "DEBITADO",
  });

  // Debit the bank account balance (HABER side decreases: bank pays out)
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
    creadoPor,
  });

  return updated;
}

export async function rejectIssuedCheckService(
  id: string,
  orgId: string,
  _creadoPor?: string
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

  const updated = await updateIssuedCheckEstado(id, orgId, {
    estado: "RECHAZADO",
  });

  // The check was never debited so no balance change on rejection at this stage.
  // Phase 2 will add the accounting journal entry (CHEQUE_PROPIO_RECHAZADO).
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

  // Create slip + link checks in a transaction
  const slip = await createCheckDepositSlip(
    input,
    validChecks.map((c) => ({ id: c.id, importe: c.importe }))
  );

  // Mark each check as DEPOSITADO and update bank balance
  await Promise.all(
    validChecks.map((c) =>
      updateReceivedCheckEstado(c.id, input.orgId, {
        estado: "DEPOSITADO",
        depositSlipId: slip.id,
      })
    )
  );

  // Credit the bank account with the total deposited
  const total = validChecks
    .reduce((acc, c) => acc + Number.parseFloat(c.importe), 0)
    .toFixed(4);

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

  // Credit the bank account
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
    creadoPor: input.creadoPor,
  });

  return slip;
}
