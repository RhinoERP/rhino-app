import Decimal from "decimal.js";
import { sql } from "kysely";
import { AppError } from "../../utils/errors";
import type { DbExecutor } from "./treasury.queries";

const STATUS_PENDING = "PENDING";
const STATUS_PARTIALLY_PAID = "PARTIALLY_PAID";

async function removeUnusedPaymentCredit(params: {
  trx: DbExecutor;
  orgId: string;
  paymentId: string;
}): Promise<void> {
  const { trx, orgId, paymentId } = params;
  const customerCredit = await trx
    .selectFrom("public.customer_credits")
    .select(["id", "amount", "remaining_amount"])
    .where("source_payment_id", "=", paymentId)
    .where("organization_id", "=", orgId)
    .forUpdate()
    .executeTakeFirst();

  if (
    customerCredit &&
    !new Decimal(customerCredit.remaining_amount).eq(customerCredit.amount)
  ) {
    throw AppError.conflict(
      "El crédito por sobrepago de esta cobranza ya fue utilizado. Revertí sus aplicaciones antes de rechazar el cheque"
    );
  }

  if (customerCredit) {
    const creditApplication = await trx
      .selectFrom("public.customer_credit_applications")
      .select("id")
      .where("customer_credit_id", "=", customerCredit.id)
      .where("organization_id", "=", orgId)
      .executeTakeFirst();

    if (creditApplication) {
      throw AppError.conflict(
        "El crédito por sobrepago de esta cobranza ya fue aplicado. Revertí sus aplicaciones antes de rechazar el cheque"
      );
    }

    await trx
      .deleteFrom("public.customer_credits")
      .where("id", "=", customerCredit.id)
      .where("organization_id", "=", orgId)
      .execute();
  }
}

async function reverseCobroAccounting(params: {
  trx: DbExecutor;
  orgId: string;
  paymentId: string;
  checkId: string;
  creadoPor?: string;
}): Promise<boolean> {
  const { trx, orgId, paymentId, checkId, creadoPor } = params;
  const journalEntry = await trx
    .selectFrom("accounting.journal_entries")
    .select("id")
    .where("org_id", "=", orgId)
    .where("referencia_id", "=", paymentId)
    .where("referencia_tabla", "=", "receivable_payments")
    .where("tipo_evento", "=", "COBRO")
    .where("estado", "=", "ACTIVO")
    .forUpdate()
    .executeTakeFirst();

  if (journalEntry) {
    await sql<{ create_contra_entry: string }>`
      SELECT accounting.create_contra_entry(
        ${journalEntry.id}::uuid,
        ${`Reversión por rechazo de cheque ${checkId}`},
        ${`REJECTED_RECEIVED_CHECK_COBRO_${checkId}`},
        ${creadoPor ?? null}::uuid
      )
    `.execute(trx);
    return true;
  }

  const informalEntries = await trx
    .selectFrom("accounting.informal_entries")
    .select(["id", "estado_formalizacion"])
    .where("org_id", "=", orgId)
    .where("referencia_id", "=", paymentId)
    .where("referencia_tabla", "=", "receivable_payments")
    .where("source_type", "=", "COBRO")
    .forUpdate()
    .execute();

  if (
    informalEntries.some((entry) => entry.estado_formalizacion === "ASENTADO")
  ) {
    throw AppError.conflict(
      "La cobranza figura asentada pero no se encontró su asiento contable"
    );
  }

  if (informalEntries.length > 0) {
    await trx
      .updateTable("accounting.informal_entries")
      .set({ estado_formalizacion: "CANCELADO" })
      .where("org_id", "=", orgId)
      .where("referencia_id", "=", paymentId)
      .where("referencia_tabla", "=", "receivable_payments")
      .where("source_type", "=", "COBRO")
      .where("estado_formalizacion", "=", "PENDIENTE")
      .execute();
  }

  return false;
}

export async function reopenReceivableForRejectedCheck(params: {
  trx: DbExecutor;
  orgId: string;
  receivablePaymentId: string | null;
  checkId: string;
  creadoPor?: string;
}): Promise<{
  reopened: boolean;
  accountingReversed: boolean;
  amount?: string;
  currency?: string;
}> {
  const { trx, orgId, receivablePaymentId } = params;

  if (!receivablePaymentId) {
    return { reopened: false, accountingReversed: false };
  }

  const payment = await trx
    .selectFrom("public.receivable_payments")
    .select(["id", "account_receivable_id", "amount", "currency"])
    .where("id", "=", receivablePaymentId)
    .where("organization_id", "=", orgId)
    .forUpdate()
    .executeTakeFirst();

  if (!payment) {
    throw AppError.conflict(
      "La cobranza vinculada al cheque no existe; requiere revisión manual"
    );
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

  await removeUnusedPaymentCredit({ trx, orgId, paymentId: payment.id });
  const accountingReversed = await reverseCobroAccounting({
    trx,
    orgId,
    paymentId: payment.id,
    checkId: params.checkId,
    creadoPor: params.creadoPor,
  });

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

  return {
    reopened: true,
    accountingReversed,
    amount: new Decimal(payment.amount).toFixed(4),
    currency: payment.currency,
  };
}
