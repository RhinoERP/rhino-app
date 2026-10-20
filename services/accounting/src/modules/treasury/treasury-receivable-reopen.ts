import Decimal from "decimal.js";
import { AppError } from "../../utils/errors";
import type { DbExecutor } from "./treasury.queries";

const STATUS_PENDING = "PENDING";
const STATUS_PARTIALLY_PAID = "PARTIALLY_PAID";

// Revierte la cobranza que originó un cheque rechazado y reabre la deuda del cliente.
export async function reopenReceivableForRejectedCheck(params: {
  trx: DbExecutor;
  orgId: string;
  receivablePaymentId: string | null;
}): Promise<void> {
  const { trx, orgId, receivablePaymentId } = params;

  if (!receivablePaymentId) {
    return;
  }

  const payment = await trx
    .selectFrom("public.receivable_payments")
    .select(["id", "account_receivable_id", "amount"])
    .where("id", "=", receivablePaymentId)
    .where("organization_id", "=", orgId)
    .forUpdate()
    .executeTakeFirst();

  if (!payment) {
    return;
  }

  const receivable = await trx
    .selectFrom("public.accounts_receivable")
    .select(["id", "total_amount", "pending_balance"])
    .where("id", "=", payment.account_receivable_id)
    .where("organization_id", "=", orgId)
    .forUpdate()
    .executeTakeFirst();

  if (!receivable) {
    throw AppError.notFound("Cuenta por cobrar de la cobranza no encontrada");
  }

  const total = new Decimal(receivable.total_amount);
  const reopened = Decimal.min(
    total,
    new Decimal(receivable.pending_balance).plus(payment.amount)
  );

  await trx
    .deleteFrom("public.commissions")
    .where("receivable_payment_id", "=", payment.id)
    .where("organization_id", "=", orgId)
    .execute();

  await trx
    .deleteFrom("public.receivable_payments")
    .where("id", "=", payment.id)
    .where("organization_id", "=", orgId)
    .execute();

  await trx
    .updateTable("public.accounts_receivable")
    .set({
      pending_balance: reopened.toFixed(4),
      status: reopened.gte(total) ? STATUS_PENDING : STATUS_PARTIALLY_PAID,
      updated_at: new Date().toISOString(),
    })
    .where("id", "=", receivable.id)
    .where("organization_id", "=", orgId)
    .execute();
}
