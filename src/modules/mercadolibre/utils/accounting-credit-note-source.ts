import { z } from "zod";
import { mapInvoiceTypeToArcaCreditNoteVoucherType } from "@/modules/arca/credit-note-invoice-payload";

const sourceSchema = z.object({
  arca_status: z.literal("authorized"),
  arca_cae: z.string().trim().min(1),
  arca_point_of_sale: z.number().int().positive(),
  arca_voucher_type_code: z.number().int().positive(),
  arca_voucher_number: z.number().int().positive(),
});
const noteSchema = z.object({
  invoice_type: z.enum([
    "FACTURA_A",
    "FACTURA_A_RETENCION",
    "FACTURA_B",
    "FACTURA_C",
  ]),
  arca_voucher_type_code: z.number().int().positive(),
  arca_associated_voucher_type_code: z.number().int().positive(),
  arca_associated_point_of_sale: z.number().int().positive(),
  arca_associated_voucher_number: z.number().int().positive(),
  arca_request_json: z.object({
    wsfeRequest: z.object({
      CbtesAsoc: z
        .array(
          z.object({
            Tipo: z.number().int().positive(),
            PtoVta: z.number().int().positive(),
            Nro: z.number().int().positive(),
          })
        )
        .length(1),
    }),
  }),
});

export function assertMeliCreditNoteFiscalSource(
  rawSale: unknown,
  rawNote: unknown
): void {
  const sale = sourceSchema.safeParse(rawSale);
  const note = noteSchema.safeParse(rawNote);
  if (!(sale.success && note.success)) {
    throw new Error(
      "La nota o su factura no tienen una asociación fiscal verificable."
    );
  }
  const associated = note.data.arca_request_json.wsfeRequest.CbtesAsoc[0];
  if (
    note.data.arca_voucher_type_code !==
      mapInvoiceTypeToArcaCreditNoteVoucherType(note.data.invoice_type) ||
    associated.Tipo !== sale.data.arca_voucher_type_code ||
    associated.PtoVta !== sale.data.arca_point_of_sale ||
    associated.Nro !== sale.data.arca_voucher_number ||
    note.data.arca_associated_voucher_type_code !== associated.Tipo ||
    note.data.arca_associated_point_of_sale !== associated.PtoVta ||
    note.data.arca_associated_voucher_number !== associated.Nro
  ) {
    throw new Error("La nota no coincide con su factura fiscal autorizada.");
  }
}
