import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import { sumMeliMoney } from "./money";

const money = z
  .number()
  .finite()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER / 100)
  .refine(
    (value) => truncateMoney(value) === value,
    "El importe admite hasta dos decimales."
  );
const currency = z.enum(["ARS", "USD"]);

export const createMeliPaymentSchema = z
  .object({
    saleId: z.uuid(),
    idempotencyKey: z.uuid(),
    amount: money.refine(
      (value) => value > 0,
      "El importe bruto cobrado debe ser mayor a cero."
    ),
    currency,
    paymentDate: z.iso.date(),
    referenceNumber: z
      .string()
      .trim()
      .min(1, "Ingresá el ID de operación Mercado Pago.")
      .max(120),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();

export const voidMeliPaymentSchema = z
  .object({
    paymentId: z.uuid(),
    reason: z
      .string()
      .trim()
      .min(5, "Explicá el motivo de anulación de la carga.")
      .max(500),
  })
  .strict();

export const meliPaymentSalesFiltersSchema = z
  .object({
    view: z.enum(["PENDING", "ALL"]).default("PENDING"),
    search: z.string().trim().max(100).default(""),
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    currency: currency.optional(),
  })
  .strict()
  .refine(
    ({ dateFrom, dateTo }) => !(dateFrom && dateTo) || dateFrom <= dateTo,
    "La fecha inicial debe ser anterior o igual a la final."
  );

export type CreateMeliPaymentInput = z.input<typeof createMeliPaymentSchema>;
export type MeliPaymentSearchParams = Partial<
  Record<
    "view" | "search" | "page" | "dateFrom" | "dateTo" | "currency",
    string
  >
>;

export function parseMeliPaymentSearchParams(search: MeliPaymentSearchParams) {
  return meliPaymentSalesFiltersSchema.safeParse({
    view: search.view ?? "PENDING",
    search: search.search ?? "",
    page: Math.max(
      1,
      Math.min(100_000, Number.parseInt(search.page ?? "1", 10) || 1)
    ),
    dateFrom: search.dateFrom || undefined,
    dateTo: search.dateTo || undefined,
    currency: search.currency || undefined,
  });
}
export type MeliPaymentRecord = {
  amount: number;
  currency: "ARS" | "USD";
  status: "RECORDED" | "VOIDED";
};

export function serializeMeliPayment(
  input: z.output<typeof createMeliPaymentSchema>
) {
  return {
    sales_order_id: input.saleId.toLowerCase(),
    amount: input.amount,
    currency: input.currency,
    payment_date: input.paymentDate,
    reference_number: input.referenceNumber,
    notes: input.notes,
  };
}

/** Operational gross collections, not a receivable or a Mercado Pago net balance. */
export function getMeliCollectionBalance(
  sale: {
    totalAmount: number;
    currency: "ARS" | "USD";
    status: "DELIVERED" | "CANCELLED";
  },
  payments: MeliPaymentRecord[]
) {
  const total = money.refine((value) => value > 0).parse(sale.totalAmount);
  const records = z
    .array(
      z.object({
        amount: money.refine((value) => value > 0),
        currency,
        status: z.enum(["RECORDED", "VOIDED"]),
      })
    )
    .parse(payments);
  if (records.some((payment) => payment.currency !== sale.currency)) {
    throw new Error(
      "Los cobros operativos deben conservar la moneda de la venta."
    );
  }
  const collectedAmount = sumMeliMoney(
    records
      .filter((payment) => payment.status === "RECORDED")
      .map((payment) => payment.amount)
  );
  if (collectedAmount > total) {
    throw new Error("Los cobros registrados superan el total de la venta.");
  }
  const outstandingAmount = sumMeliMoney([total, -collectedAmount]);
  let status: "UNPAID" | "PARTIAL" | "PAID" = "PARTIAL";
  if (collectedAmount === 0) {
    status = "UNPAID";
  }
  if (outstandingAmount === 0) {
    status = "PAID";
  }
  return {
    collectedAmount,
    outstandingAmount,
    status,
    canRegister: sale.status === "DELIVERED" && outstandingAmount > 0,
  };
}
