import type { Transaction } from "kysely";
import { db } from "../../db/client";
import type { Database, TreasuryOperation } from "../../db/types";
import { AppError } from "../../utils/errors";
import { hashTreasuryPayload } from "./treasury-idempotency-payload";

export type TreasuryOperationType =
  | "BANK_MOVEMENT_CREATE"
  | "RECEIVED_CHECK_CREATE"
  | "RECEIVED_CHECK_REJECT"
  | "ISSUED_CHECK_CREATE"
  | "ISSUED_CHECK_DEBIT"
  | "ISSUED_CHECK_REJECT"
  | "CHECK_DEPOSIT_SLIP_CREATE"
  | "CASH_DEPOSIT_SLIP_CREATE";

export type TreasuryOperationResult = {
  resultTable?: string;
  resultId?: string;
  journalEntryId?: string;
  movementId?: string;
};

type IdempotentOperationOptions<TResult> = {
  orgId: string;
  operationKey: string;
  operationType: TreasuryOperationType;
  payload: unknown;
  loadExisting: (operation: TreasuryOperation) => Promise<TResult>;
  execute: (
    trx: Transaction<Database>,
    operationId: string
  ) => Promise<{
    result: TResult;
    metadata: TreasuryOperationResult;
  }>;
};

export const buildTreasuryJournalKey = (
  orgId: string,
  operationType: TreasuryOperationType,
  operationKey: string
): string => `TREASURY:${orgId}:${operationType}:${operationKey}`;

export async function runIdempotentTreasuryOperation<TResult>({
  orgId,
  operationKey,
  operationType,
  payload,
  loadExisting,
  execute,
}: IdempotentOperationOptions<TResult>): Promise<TResult> {
  const requestHash = hashTreasuryPayload(payload);

  const existing = await db
    .selectFrom("accounting.treasury_operations")
    .selectAll()
    .where("org_id", "=", orgId)
    .where("operation_key", "=", operationKey)
    .executeTakeFirst();

  if (existing) {
    assertOperationCompatibility(existing, operationType, requestHash);
    return loadExisting(existing);
  }

  return db.transaction().execute(async (trx) => {
    const insertedOperation = await trx
      .insertInto("accounting.treasury_operations")
      .values({
        org_id: orgId,
        operation_key: operationKey,
        operation_type: operationType,
        request_hash: requestHash,
      })
      .onConflict((conflict) =>
        conflict.columns(["org_id", "operation_key"]).doNothing()
      )
      .returningAll()
      .executeTakeFirst();

    if (!insertedOperation) {
      const conflicted = await trx
        .selectFrom("accounting.treasury_operations")
        .selectAll()
        .where("org_id", "=", orgId)
        .where("operation_key", "=", operationKey)
        .forUpdate()
        .executeTakeFirstOrThrow();

      assertOperationCompatibility(conflicted, operationType, requestHash);
      return loadExisting(conflicted);
    }

    const executed = await execute(trx, insertedOperation.id);

    await trx
      .updateTable("accounting.treasury_operations")
      .set({
        result_table: executed.metadata.resultTable ?? null,
        result_id: executed.metadata.resultId ?? null,
        journal_entry_id: executed.metadata.journalEntryId ?? null,
        movement_id: executed.metadata.movementId ?? null,
      })
      .where("id", "=", insertedOperation.id)
      .execute();

    return executed.result;
  });
}

function assertOperationCompatibility(
  operation: TreasuryOperation,
  operationType: TreasuryOperationType,
  requestHash: string
): void {
  if (operation.operation_type !== operationType) {
    throw AppError.conflict(
      "La clave de idempotencia ya fue utilizada para otro tipo de operación"
    );
  }

  if (operation.request_hash !== requestHash) {
    throw AppError.conflict(
      "La clave de idempotencia ya fue utilizada con un payload distinto"
    );
  }
}
