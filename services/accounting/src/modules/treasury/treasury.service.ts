import { randomUUID } from "node:crypto";
import type { Transaction } from "kysely";
import { db } from "../../db/client";
import type {
  Database,
  TreasuryBankAccount,
  TreasuryMovement,
} from "../../db/types";
import { AppError } from "../../utils/errors";
import { resolveAccountFull } from "../accounts/accounts.queries";
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
  type DbExecutor,
  getBankAccountById,
  getBankAccountByIdForUpdate,
  getDepositSlipWithChecks,
  getIssuedCheckById,
  getIssuedCheckByIdForUpdate,
  getMovementById,
  getReceivedCheckById,
  getReceivedCheckByIdForUpdate,
  listMovements,
  listReceivedChecksByIdsForUpdate,
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
import {
  buildTreasuryJournalKey,
  runIdempotentTreasuryOperation,
} from "./treasury-idempotency";
import { normalizeTreasuryPayload } from "./treasury-idempotency-payload";

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
  executor = db,
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
  executor?: DbExecutor;
}): Promise<string> {
  const resolvedLineas = await Promise.all(
    lineas.map(async (line) => {
      const cuenta = await getAccountByCode(line.accountCode, orgId, executor);
      if (!cuenta) {
        throw AppError.unprocessable(
          `Cuenta no encontrada para '${line.accountCode}'. Configure el plan de cuentas antes de registrar el asiento.`
        );
      }

      return {
        cuentaId: cuenta.id,
        debe: line.lado === "DEBE" ? line.importe : "0.0000",
        haber: line.lado === "HABER" ? line.importe : "0.0000",
        descripcion: line.descripcion,
      };
    })
  );

  return callCreateJournalEntry(
    {
      orgId,
      tipoEvento,
      referenciaId,
      referenciaTabla,
      fecha,
      descripcion,
      idempotencyKey,
      creadoPor,
      lineas: resolvedLineas,
    },
    executor
  );
}

function getAccountByCode(
  accountCode: string,
  orgId: string,
  executor: DbExecutor = db
) {
  return executor
    .selectFrom("accounting.chart_of_accounts")
    .select(["id", "codigo", "account_code"])
    .where("account_code", "=", accountCode)
    .where("org_id", "=", orgId)
    .executeTakeFirst();
}

async function getBankAccountCode(
  cuentaContableId: string,
  orgId: string,
  executor: DbExecutor = db
): Promise<string> {
  const coa = await executor
    .selectFrom("accounting.chart_of_accounts")
    .select(["id", "codigo", "account_code"])
    .where("id", "=", cuentaContableId)
    .where("org_id", "=", orgId)
    .executeTakeFirst();

  if (!coa) {
    throw AppError.notFound(
      "La cuenta contable vinculada a la cuenta bancaria no fue encontrada"
    );
  }
  if (!coa.account_code) {
    throw AppError.unprocessable(
      `La cuenta contable ${coa.codigo} no tiene un account_code semántico configurado`
    );
  }

  return coa.account_code;
}

const normalizeAmount = (amount: string): string => Number(amount).toFixed(4);

const stripMetadata = <T extends Record<string, unknown>>(input: T): T => {
  const { creadoPor: _creadoPor, operationId: _operationId, ...rest } = input;
  return rest as T;
};

const buildOperationKey = (value?: string): string => value ?? randomUUID();

const buildTransitionOperationKey = (prefix: string, id: string): string =>
  `${prefix}:${id}`;

async function validateMovementAccount(
  input: CreateBankAccountInput | UpdateBankAccountInput,
  orgId: string
) {
  const cuentaContableId =
    "cuentaContableId" in input ? input.cuentaContableId : undefined;
  if (!cuentaContableId) {
    return;
  }

  const cuenta = await resolveAccountFull(cuentaContableId, orgId).then(() =>
    db
      .selectFrom("accounting.chart_of_accounts")
      .select(["id", "tipo", "permite_movimientos", "activa"])
      .where("id", "=", cuentaContableId)
      .where("org_id", "=", orgId)
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
}

async function loadBankAccountForMutation(
  cuentaBancariaId: string,
  orgId: string,
  trx: Transaction<Database>
): Promise<TreasuryBankAccount> {
  const cuenta = await getBankAccountByIdForUpdate(
    cuentaBancariaId,
    orgId,
    trx
  );
  if (!cuenta) {
    throw AppError.notFound("Cuenta bancaria no encontrada");
  }
  if (!cuenta.activa) {
    throw AppError.unprocessable("La cuenta bancaria está inactiva");
  }
  return cuenta;
}

async function createOperationalMovement(options: {
  trx: Transaction<Database>;
  operationId: string;
  input: CreateMovementInput;
}): Promise<TreasuryMovement> {
  const movement = await createMovement(
    options.input,
    options.operationId,
    options.trx
  );
  await applyMovementToBalance({
    cuentaBancariaId: options.input.cuentaBancariaId,
    orgId: options.input.orgId,
    importe: options.input.importe,
    lado: options.input.lado,
    executor: options.trx,
  });
  return movement;
}

async function loadExistingMovementResult(operationId: string, orgId: string) {
  const movement = await getMovementById(operationId, orgId);
  if (!movement) {
    throw new AppError("No se pudo recuperar el movimiento idempotente", 500);
  }
  return movement;
}

export async function createBankAccountService(input: CreateBankAccountInput) {
  await validateMovementAccount(input, input.orgId);
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

  await validateMovementAccount(input, orgId);

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

export function createMovementService(input: CreateMovementInput) {
  if (input.tipo !== "DEBITO_BANCARIO" && input.tipo !== "CREDITO_BANCARIO") {
    throw AppError.badRequest(
      "createMovementService solo admite movimientos bancarios manuales"
    );
  }
  if (!input.cuentaContrapartidaCode) {
    throw AppError.badRequest(
      "Se requiere cuentaContrapartidaCode para movimientos bancarios manuales"
    );
  }
  const cuentaContrapartidaCode = input.cuentaContrapartidaCode;

  const operationKey = buildOperationKey(input.operationId);
  const normalizedAmount = normalizeAmount(input.importe);
  const payload = normalizeTreasuryPayload({
    ...stripMetadata(input),
    importe: normalizedAmount,
  });

  return runIdempotentTreasuryOperation({
    orgId: input.orgId,
    operationKey,
    operationType: "BANK_MOVEMENT_CREATE",
    payload,
    loadExisting: (operation) => {
      if (
        !operation.result_id ||
        operation.result_table !== "treasury_movements"
      ) {
        throw new AppError(
          "La operación idempotente no tiene movimiento asociado",
          500
        );
      }
      return loadExistingMovementResult(operation.result_id, input.orgId);
    },
    execute: async (trx, operationId) => {
      const cuenta = await loadBankAccountForMutation(
        input.cuentaBancariaId,
        input.orgId,
        trx
      );
      const bankCode = await getBankAccountCode(
        cuenta.cuenta_contable_id,
        input.orgId,
        trx
      );
      const tipoEvento:
        | "MOVIMIENTO_BANCARIO_DEBITO"
        | "MOVIMIENTO_BANCARIO_CREDITO" =
        input.tipo === "DEBITO_BANCARIO"
          ? "MOVIMIENTO_BANCARIO_DEBITO"
          : "MOVIMIENTO_BANCARIO_CREDITO";

      const lineas: TreasuryLine[] =
        input.tipo === "DEBITO_BANCARIO"
          ? [
              {
                accountCode: cuentaContrapartidaCode,
                lado: "DEBE",
                importe: normalizedAmount,
              },
              {
                accountCode: bankCode,
                lado: "HABER",
                importe: normalizedAmount,
              },
            ]
          : [
              {
                accountCode: bankCode,
                lado: "DEBE",
                importe: normalizedAmount,
              },
              {
                accountCode: cuentaContrapartidaCode,
                lado: "HABER",
                importe: normalizedAmount,
              },
            ];

      const referenceId = input.referenciaId ?? randomUUID();
      const journalEntryId = await createTreasuryJournalEntry({
        orgId: input.orgId,
        tipoEvento,
        referenciaId: referenceId,
        referenciaTabla: "treasury_movements",
        fecha: input.fecha,
        descripcion: input.descripcion,
        idempotencyKey: buildTreasuryJournalKey(
          input.orgId,
          "BANK_MOVEMENT_CREATE",
          operationKey
        ),
        creadoPor: input.creadoPor,
        lineas,
        executor: trx,
      });

      const movement = await createOperationalMovement({
        trx,
        operationId,
        input: {
          ...input,
          importe: normalizedAmount,
          referenciaId: referenceId,
          journalEntryId,
        },
      });

      return {
        result: movement,
        metadata: {
          resultTable: "treasury_movements",
          resultId: movement.id,
          journalEntryId,
          movementId: movement.id,
        },
      };
    },
  });
}

export function listMovementsService(filters: ListMovementsFilters) {
  return listMovements(filters);
}

export function createReceivedCheckService(input: CreateReceivedCheckInput) {
  const operationKey = buildOperationKey(input.operationId);
  const normalizedAmount = normalizeAmount(input.importe);
  const payload = normalizeTreasuryPayload({
    ...stripMetadata(input),
    importe: normalizedAmount,
  });

  return runIdempotentTreasuryOperation({
    orgId: input.orgId,
    operationKey,
    operationType: "RECEIVED_CHECK_CREATE",
    payload,
    loadExisting: async (operation) => {
      if (
        !operation.result_id ||
        operation.result_table !== "received_checks"
      ) {
        throw new AppError(
          "La operación idempotente no tiene cheque asociado",
          500
        );
      }
      const check = await getReceivedCheckById(
        operation.result_id,
        input.orgId
      );
      if (!check) {
        throw new AppError("No se pudo recuperar el cheque idempotente", 500);
      }
      return check;
    },
    execute: async (trx, operationId) => {
      const check = await createReceivedCheck(
        { ...input, importe: normalizedAmount },
        operationId,
        trx
      );

      return {
        result: check,
        metadata: {
          resultTable: "received_checks",
          resultId: check.id,
        },
      };
    },
  });
}

export function rejectReceivedCheckService(
  id: string,
  orgId: string,
  input: RejectReceivedCheckInput
) {
  const operationKey = buildTransitionOperationKey("received-check-reject", id);
  const today = new Date().toISOString().slice(0, 10);
  const payload = normalizeTreasuryPayload({
    checkId: id,
    cuentaBancariaId: input.cuentaBancariaId,
    cuentaContrapartidaCode:
      input.cuentaContrapartidaCode ?? "CHEQUES_RECHAZADOS",
  });

  return runIdempotentTreasuryOperation({
    orgId,
    operationKey,
    operationType: "RECEIVED_CHECK_REJECT",
    payload,
    loadExisting: async (operation) => {
      if (
        !operation.result_id ||
        operation.result_table !== "received_checks"
      ) {
        throw new AppError(
          "La operación idempotente no tiene cheque asociado",
          500
        );
      }
      const check = await getReceivedCheckById(operation.result_id, orgId);
      if (!check) {
        throw new AppError("No se pudo recuperar el cheque idempotente", 500);
      }
      return check;
    },
    execute: async (trx, operationId) => {
      const check = await getReceivedCheckByIdForUpdate(id, orgId, trx);
      if (!check) {
        throw AppError.notFound(`Cheque recibido ${id} no encontrado`);
      }
      if (check.estado !== "DEPOSITADO") {
        throw AppError.unprocessable(
          "Solo se pueden rechazar cheques en estado DEPOSITADO"
        );
      }

      const cuentaBancaria = await loadBankAccountForMutation(
        input.cuentaBancariaId,
        orgId,
        trx
      );
      const bankCode = await getBankAccountCode(
        cuentaBancaria.cuenta_contable_id,
        orgId,
        trx
      );
      const contrapartidaCode =
        input.cuentaContrapartidaCode ?? "CHEQUES_RECHAZADOS";

      const journalEntryId = await createTreasuryJournalEntry({
        orgId,
        tipoEvento: "CHEQUE_RECIBIDO_RECHAZADO",
        referenciaId: id,
        referenciaTabla: "received_checks",
        fecha: today,
        descripcion: `Rechazo cheque ${check.numero_cheque} (—) ${check.banco_emisor}`,
        idempotencyKey: buildTreasuryJournalKey(
          orgId,
          "RECEIVED_CHECK_REJECT",
          operationKey
        ),
        creadoPor: input.creadoPor,
        lineas: [
          {
            accountCode: contrapartidaCode,
            lado: "DEBE",
            importe: check.importe,
          },
          { accountCode: bankCode, lado: "HABER", importe: check.importe },
        ],
        executor: trx,
      });

      const updated = await updateReceivedCheckEstado(
        id,
        orgId,
        {
          estado: "RECHAZADO",
          journalEntryId,
        },
        trx
      );
      if (!updated) {
        throw new AppError("No se pudo actualizar el cheque rechazado", 500);
      }

      const movement = await createOperationalMovement({
        trx,
        operationId,
        input: {
          orgId,
          cuentaBancariaId: input.cuentaBancariaId,
          tipo: "CHEQUE_RECIBIDO_RECHAZADO",
          fecha: today,
          descripcion: `Rechazo cheque ${check.numero_cheque} — ${check.banco_emisor}`,
          importe: check.importe,
          lado: "DEBE",
          referenciaId: id,
          referenciaTabla: "received_checks",
          journalEntryId,
          creadoPor: input.creadoPor,
        },
      });

      return {
        result: updated,
        metadata: {
          resultTable: "received_checks",
          resultId: updated.id,
          journalEntryId,
          movementId: movement.id,
        },
      };
    },
  });
}

export function createIssuedCheckService(input: CreateIssuedCheckInput) {
  const operationKey = input.referenciaPagoId
    ? `issued-check:payable-payment:${input.referenciaPagoId}`
    : buildOperationKey(input.operationId);
  const normalizedAmount = normalizeAmount(input.importe);
  const payload = normalizeTreasuryPayload({
    ...stripMetadata(input),
    importe: normalizedAmount,
  });

  return runIdempotentTreasuryOperation({
    orgId: input.orgId,
    operationKey,
    operationType: "ISSUED_CHECK_CREATE",
    payload,
    loadExisting: async (operation) => {
      if (!operation.result_id || operation.result_table !== "issued_checks") {
        throw new AppError(
          "La operación idempotente no tiene cheque asociado",
          500
        );
      }
      const check = await getIssuedCheckById(operation.result_id, input.orgId);
      if (!check) {
        throw new AppError("No se pudo recuperar el cheque idempotente", 500);
      }
      return check;
    },
    execute: async (trx, operationId) => {
      await loadBankAccountForMutation(
        input.cuentaBancariaId,
        input.orgId,
        trx
      );
      const check = await createIssuedCheck(
        { ...input, importe: normalizedAmount },
        operationId,
        trx
      );

      return {
        result: check,
        metadata: {
          resultTable: "issued_checks",
          resultId: check.id,
        },
      };
    },
  });
}

export function debitIssuedCheckService(
  id: string,
  orgId: string,
  creadoPor?: string
) {
  const operationKey = buildTransitionOperationKey("issued-check-debit", id);
  const today = new Date().toISOString().slice(0, 10);

  return runIdempotentTreasuryOperation({
    orgId,
    operationKey,
    operationType: "ISSUED_CHECK_DEBIT",
    payload: { checkId: id },
    loadExisting: async (operation) => {
      if (!operation.result_id || operation.result_table !== "issued_checks") {
        throw new AppError(
          "La operación idempotente no tiene cheque asociado",
          500
        );
      }
      const check = await getIssuedCheckById(operation.result_id, orgId);
      if (!check) {
        throw new AppError("No se pudo recuperar el cheque idempotente", 500);
      }
      return check;
    },
    execute: async (trx, operationId) => {
      const check = await getIssuedCheckByIdForUpdate(id, orgId, trx);
      if (!check) {
        throw AppError.notFound(`Cheque emitido ${id} no encontrado`);
      }
      if (check.estado !== "EMITIDO") {
        throw AppError.unprocessable(
          "Solo se pueden debitar cheques en estado EMITIDO"
        );
      }

      const cuentaBancaria = await loadBankAccountForMutation(
        check.cuenta_bancaria_id,
        orgId,
        trx
      );
      const bankCode = await getBankAccountCode(
        cuentaBancaria.cuenta_contable_id,
        orgId,
        trx
      );

      const journalEntryId = await createTreasuryJournalEntry({
        orgId,
        tipoEvento: "DEBITO_CHEQUE_PROPIO",
        referenciaId: id,
        referenciaTabla: "issued_checks",
        fecha: today,
        descripcion: `Débito cheque propio ${check.numero_cheque} — ${check.beneficiario}`,
        idempotencyKey: buildTreasuryJournalKey(
          orgId,
          "ISSUED_CHECK_DEBIT",
          operationKey
        ),
        creadoPor,
        lineas: [
          {
            accountCode: "VALORES_A_PAGAR",
            lado: "DEBE",
            importe: check.importe,
          },
          { accountCode: bankCode, lado: "HABER", importe: check.importe },
        ],
        executor: trx,
      });

      const updated = await updateIssuedCheckEstado(
        id,
        orgId,
        {
          estado: "DEBITADO",
          journalEntryId,
        },
        trx
      );
      if (!updated) {
        throw new AppError("No se pudo actualizar el cheque debitado", 500);
      }

      const movement = await createOperationalMovement({
        trx,
        operationId,
        input: {
          orgId,
          cuentaBancariaId: check.cuenta_bancaria_id,
          tipo: "DEBITO_CHEQUE_PROPIO",
          fecha: today,
          descripcion: `Débito cheque propio ${check.numero_cheque} — ${check.beneficiario}`,
          importe: check.importe,
          lado: "DEBE",
          referenciaId: id,
          referenciaTabla: "issued_checks",
          journalEntryId,
          creadoPor,
        },
      });

      return {
        result: updated,
        metadata: {
          resultTable: "issued_checks",
          resultId: updated.id,
          journalEntryId,
          movementId: movement.id,
        },
      };
    },
  });
}

export function rejectIssuedCheckService(
  id: string,
  orgId: string,
  input: RejectIssuedCheckInput
) {
  const operationKey = buildTransitionOperationKey("issued-check-reject", id);
  const today = new Date().toISOString().slice(0, 10);
  const payload = normalizeTreasuryPayload({
    checkId: id,
    cuentaContrapartidaCode: input.cuentaContrapartidaCode,
  });

  return runIdempotentTreasuryOperation({
    orgId,
    operationKey,
    operationType: "ISSUED_CHECK_REJECT",
    payload,
    loadExisting: async (operation) => {
      if (!operation.result_id || operation.result_table !== "issued_checks") {
        throw new AppError(
          "La operación idempotente no tiene cheque asociado",
          500
        );
      }
      const check = await getIssuedCheckById(operation.result_id, orgId);
      if (!check) {
        throw new AppError("No se pudo recuperar el cheque idempotente", 500);
      }
      return check;
    },
    execute: async (trx, operationId) => {
      const check = await getIssuedCheckByIdForUpdate(id, orgId, trx);
      if (!check) {
        throw AppError.notFound(`Cheque emitido ${id} no encontrado`);
      }
      if (check.estado !== "EMITIDO") {
        throw AppError.unprocessable(
          "Solo se pueden rechazar cheques en estado EMITIDO"
        );
      }

      const cuentaBancaria = await loadBankAccountForMutation(
        check.cuenta_bancaria_id,
        orgId,
        trx
      );
      const bankCode = await getBankAccountCode(
        cuentaBancaria.cuenta_contable_id,
        orgId,
        trx
      );

      const journalEntryId = await createTreasuryJournalEntry({
        orgId,
        tipoEvento: "CHEQUE_PROPIO_RECHAZADO",
        referenciaId: id,
        referenciaTabla: "issued_checks",
        fecha: today,
        descripcion: `Rechazo cheque propio ${check.numero_cheque} — ${check.beneficiario}`,
        idempotencyKey: buildTreasuryJournalKey(
          orgId,
          "ISSUED_CHECK_REJECT",
          operationKey
        ),
        creadoPor: input.creadoPor,
        lineas: [
          { accountCode: bankCode, lado: "DEBE", importe: check.importe },
          {
            accountCode: input.cuentaContrapartidaCode,
            lado: "HABER",
            importe: check.importe,
          },
        ],
        executor: trx,
      });

      const updated = await updateIssuedCheckEstado(
        id,
        orgId,
        {
          estado: "RECHAZADO",
          journalEntryId,
        },
        trx
      );
      if (!updated) {
        throw new AppError("No se pudo actualizar el cheque rechazado", 500);
      }

      const movement = await createOperationalMovement({
        trx,
        operationId,
        input: {
          orgId,
          cuentaBancariaId: check.cuenta_bancaria_id,
          tipo: "CHEQUE_PROPIO_RECHAZADO",
          fecha: today,
          descripcion: `Rechazo cheque propio ${check.numero_cheque} — ${check.beneficiario}`,
          importe: check.importe,
          lado: "HABER",
          referenciaId: id,
          referenciaTabla: "issued_checks",
          journalEntryId,
          creadoPor: input.creadoPor,
        },
      });

      return {
        result: updated,
        metadata: {
          resultTable: "issued_checks",
          resultId: updated.id,
          journalEntryId,
          movementId: movement.id,
        },
      };
    },
  });
}

export function createCheckDepositSlipService(
  input: CreateCheckDepositSlipInput
) {
  if (input.checkIds.length === 0) {
    throw AppError.badRequest(
      "Debe seleccionar al menos un cheque para depositar"
    );
  }

  const operationKey = buildOperationKey(input.operationId);
  const sortedCheckIds = [...new Set(input.checkIds)].sort((left, right) =>
    left.localeCompare(right)
  );
  const payload = normalizeTreasuryPayload({
    ...stripMetadata(input),
    checkIds: sortedCheckIds,
  });

  return runIdempotentTreasuryOperation({
    orgId: input.orgId,
    operationKey,
    operationType: "CHECK_DEPOSIT_SLIP_CREATE",
    payload,
    loadExisting: async (operation) => {
      if (
        !operation.result_id ||
        operation.result_table !== "treasury_deposit_slips"
      ) {
        throw new AppError(
          "La operación idempotente no tiene boleta asociada",
          500
        );
      }
      const slip = await getDepositSlipWithChecks(
        operation.result_id,
        input.orgId
      );
      if (!slip) {
        throw new AppError("No se pudo recuperar la boleta idempotente", 500);
      }
      return slip;
    },
    execute: async (trx, operationId) => {
      const cuenta = await loadBankAccountForMutation(
        input.cuentaBancariaId,
        input.orgId,
        trx
      );
      const checks = await listReceivedChecksByIdsForUpdate(
        sortedCheckIds,
        input.orgId,
        trx
      );

      if (checks.length !== sortedCheckIds.length) {
        const foundIds = new Set(checks.map((check) => check.id));
        const missingId = sortedCheckIds.find(
          (checkId) => !foundIds.has(checkId)
        );
        throw AppError.notFound(`Cheque ${missingId} no encontrado`);
      }

      const invalidCheck = checks.find(
        (check) => check.estado !== "EN_CARTERA"
      );
      if (invalidCheck) {
        throw AppError.unprocessable(
          `El cheque ${invalidCheck.numero_cheque} no está EN_CARTERA (estado: ${invalidCheck.estado})`
        );
      }

      const slip = await createCheckDepositSlip(
        { ...input, checkIds: sortedCheckIds },
        checks.map((check) => ({ id: check.id, importe: check.importe })),
        operationId,
        trx
      );

      for (const check of checks) {
        const updated = await updateReceivedCheckEstado(
          check.id,
          input.orgId,
          {
            estado: "DEPOSITADO",
            depositSlipId: slip.id,
          },
          trx
        );
        if (!updated) {
          throw new AppError("No se pudo actualizar un cheque depositado", 500);
        }
      }

      const total = checks
        .reduce((acc, check) => acc + Number.parseFloat(check.importe), 0)
        .toFixed(4);
      const bankCode = await getBankAccountCode(
        cuenta.cuenta_contable_id,
        input.orgId,
        trx
      );
      const journalEntryId = await createTreasuryJournalEntry({
        orgId: input.orgId,
        tipoEvento: "DEPOSITO_CHEQUES",
        referenciaId: slip.id,
        referenciaTabla: "treasury_deposit_slips",
        fecha: input.fecha,
        descripcion: input.descripcion,
        idempotencyKey: buildTreasuryJournalKey(
          input.orgId,
          "CHECK_DEPOSIT_SLIP_CREATE",
          operationKey
        ),
        creadoPor: input.creadoPor,
        lineas: [
          { accountCode: bankCode, lado: "DEBE", importe: total },
          { accountCode: "VALORES_A_DEPOSITAR", lado: "HABER", importe: total },
        ],
        executor: trx,
      });

      await trx
        .updateTable("accounting.treasury_deposit_slips")
        .set({ journal_entry_id: journalEntryId })
        .where("id", "=", slip.id)
        .execute();

      const movement = await createOperationalMovement({
        trx,
        operationId,
        input: {
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
        },
      });

      const slipWithChecks = await getDepositSlipWithChecks(
        slip.id,
        input.orgId,
        trx
      );
      if (!slipWithChecks) {
        throw new AppError("No se pudo recuperar la boleta creada", 500);
      }

      return {
        result: slipWithChecks,
        metadata: {
          resultTable: "treasury_deposit_slips",
          resultId: slip.id,
          journalEntryId,
          movementId: movement.id,
        },
      };
    },
  });
}

export function createCashDepositSlipService(
  input: CreateCashDepositSlipInput
) {
  const operationKey = buildOperationKey(input.operationId);
  const normalizedAmount = normalizeAmount(input.importe);
  const payload = normalizeTreasuryPayload({
    ...stripMetadata(input),
    importe: normalizedAmount,
  });

  return runIdempotentTreasuryOperation({
    orgId: input.orgId,
    operationKey,
    operationType: "CASH_DEPOSIT_SLIP_CREATE",
    payload,
    loadExisting: async (operation) => {
      if (
        !operation.result_id ||
        operation.result_table !== "treasury_deposit_slips"
      ) {
        throw new AppError(
          "La operación idempotente no tiene boleta asociada",
          500
        );
      }
      const slip = await getDepositSlipWithChecks(
        operation.result_id,
        input.orgId
      );
      if (!slip) {
        throw new AppError("No se pudo recuperar la boleta idempotente", 500);
      }
      return slip;
    },
    execute: async (trx, operationId) => {
      const cuenta = await loadBankAccountForMutation(
        input.cuentaBancariaId,
        input.orgId,
        trx
      );
      const slip = await createCashDepositSlip(
        { ...input, importe: normalizedAmount },
        operationId,
        trx
      );

      const bankCode = await getBankAccountCode(
        cuenta.cuenta_contable_id,
        input.orgId,
        trx
      );
      const journalEntryId = await createTreasuryJournalEntry({
        orgId: input.orgId,
        tipoEvento: "DEPOSITO_EFECTIVO",
        referenciaId: slip.id,
        referenciaTabla: "treasury_deposit_slips",
        fecha: input.fecha,
        descripcion: input.descripcion,
        idempotencyKey: buildTreasuryJournalKey(
          input.orgId,
          "CASH_DEPOSIT_SLIP_CREATE",
          operationKey
        ),
        creadoPor: input.creadoPor,
        lineas: [
          { accountCode: bankCode, lado: "DEBE", importe: normalizedAmount },
          {
            accountCode: input.cuentaCajaCode,
            lado: "HABER",
            importe: normalizedAmount,
          },
        ],
        executor: trx,
      });

      await trx
        .updateTable("accounting.treasury_deposit_slips")
        .set({ journal_entry_id: journalEntryId })
        .where("id", "=", slip.id)
        .execute();

      const movement = await createOperationalMovement({
        trx,
        operationId,
        input: {
          orgId: input.orgId,
          cuentaBancariaId: input.cuentaBancariaId,
          tipo: "DEPOSITO_EFECTIVO",
          fecha: input.fecha,
          descripcion: input.descripcion,
          importe: normalizedAmount,
          lado: "HABER",
          referenciaId: slip.id,
          referenciaTabla: "treasury_deposit_slips",
          journalEntryId,
          creadoPor: input.creadoPor,
        },
      });

      const slipWithChecks = await getDepositSlipWithChecks(
        slip.id,
        input.orgId,
        trx
      );
      if (!slipWithChecks) {
        throw new AppError("No se pudo recuperar la boleta creada", 500);
      }

      return {
        result: slipWithChecks,
        metadata: {
          resultTable: "treasury_deposit_slips",
          resultId: slip.id,
          journalEntryId,
          movementId: movement.id,
        },
      };
    },
  });
}
