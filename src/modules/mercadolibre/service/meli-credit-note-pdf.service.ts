import "server-only";
import { z } from "zod";
import { paginateFiscalInvoiceHtml } from "@/modules/arca/server/html-to-pdf.service";
import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import { resolveCreditNoteFiscalBreakdown } from "@/modules/credit-notes/service/credit-note-fiscal-breakdown";
import {
  type CreditNotePDFData,
  generateCreditNoteHTML,
} from "@/modules/credit-notes/service/credit-note-pdf.service";
import { getCustomerTaxConditionLabel } from "@/modules/customers/tax-conditions";
import { sumMeliMoney } from "../utils/money";
import { getMeliCreditNoteContext } from "./meli-credit-note-read.service";
import { resolveMeliFiscalReceiver } from "./meli-fiscal-receiver";

const amount = z.number().finite().nonnegative();
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const requestSchema = z.object({
  wsfeRequest: z.object({
    PtoVta: z.number().int().positive(),
    CbteTipo: z.number().int().positive(),
    DocTipo: z.number().int(),
    DocNro: z.number().int(),
    CbteFch: z.number().int(),
    MonId: z.string(),
    MonCotiz: z.number().finite().positive(),
    ImpTotal: amount,
    ImpNeto: amount,
    ImpIVA: amount,
    ImpTrib: amount,
    ImpOpEx: amount,
    ImpTotConc: amount,
    Iva: z
      .array(
        z.object({ Id: z.number().int(), BaseImp: amount, Importe: amount })
      )
      .optional(),
    Tributos: z
      .array(
        z.object({
          Id: z.number().int(),
          Desc: z.string(),
          Alic: amount,
          BaseImp: amount,
          Importe: amount,
        })
      )
      .optional(),
  }),
});
const rates: Record<number, number> = {
  3: 0,
  4: 10.5,
  5: 21,
  6: 27,
  8: 5,
  9: 2.5,
};

export async function generateMeliCreditNoteHtml(
  orgSlug: string,
  creditNoteId: string
) {
  const { note, sale, receiver, organization } = await getMeliCreditNoteContext(
    orgSlug,
    creditNoteId
  );
  if (
    note.arca_status !== "authorized" ||
    !note.arca_cae ||
    !note.arca_point_of_sale ||
    !note.arca_voucher_number ||
    !note.arca_voucher_type_code
  ) {
    throw new Error("La nota de crédito todavía no está autorizada por ARCA.");
  }
  const { wsfeRequest: request } = requestSchema.parse(note.arca_request_json);
  const fiscalReceiver = resolveMeliFiscalReceiver(receiver, note.customer_id);
  if (
    request.PtoVta !== note.arca_point_of_sale ||
    request.CbteTipo !== note.arca_voucher_type_code ||
    request.ImpTotal !== note.amount ||
    request.DocNro !== Number(receiver.document_number) ||
    request.DocTipo !== (receiver.document_type === "DNI" ? 96 : 80)
  ) {
    throw new Error(
      "La solicitud fiscal no coincide con la nota de crédito autorizada."
    );
  }
  const fiscalBreakdown = resolveCreditNoteFiscalBreakdown(
    note.arca_response_json,
    {
      salesOrderId: note.sales_order_id,
      arcaStatus: note.arca_status,
      amount: note.amount,
      arcaPointOfSale: note.arca_point_of_sale,
      arcaVoucherTypeCode: note.arca_voucher_type_code,
      arcaVoucherNumber: note.arca_voucher_number,
      arcaCae: note.arca_cae,
    }
  ) ?? {
    netAmount: request.ImpNeto,
    exemptAmount: request.ImpOpEx,
    untaxedAmount: request.ImpTotConc,
    totalAmount: request.ImpTotal,
    taxes: [
      ...(request.Iva ?? []).map((tax) => ({
        name: "IVA",
        rate: rates[tax.Id] ?? 0,
        baseAmount: tax.BaseImp,
        taxAmount: tax.Importe,
      })),
      ...(request.Tributos ?? []).map((tax) => ({
        name: tax.Desc,
        rate: tax.Alic,
        baseAmount: tax.BaseImp,
        taxAmount: tax.Importe,
      })),
    ],
  };
  const settings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id,
    "system"
  );
  const net = sumMeliMoney([
    fiscalBreakdown.netAmount,
    fiscalBreakdown.exemptAmount,
    fiscalBreakdown.untaxedAmount,
  ]);
  const fiscalNumber = `${String(note.arca_point_of_sale).padStart(4, "0")}-${String(note.arca_voucher_number).padStart(8, "0")}`;
  const data: CreditNotePDFData = {
    creditNoteNumber: note.credit_note_number ?? note.id,
    issueDate: String(request.CbteFch).replace(COMPACT_DATE, "$1-$2-$3"),
    invoiceType: note.invoice_type,
    originType: "MANUAL_ADJUSTMENT",
    reason: note.reason,
    issuer: {
      organizationName: organization.name,
      businessName: settings?.issuer_business_name ?? organization.name,
      cuit: organization.cuit,
      legalAddress: settings?.issuer_legal_address,
      logoUrl: settings?.issuer_logo_data_url,
    },
    customer: {
      businessName: fiscalReceiver.businessName,
      cuit: fiscalReceiver.cuit,
      document: fiscalReceiver.document,
      taxCondition: getCustomerTaxConditionLabel(fiscalReceiver.taxCondition),
      address: fiscalReceiver.address,
    },
    sale: {
      saleNumber: sale.sale_number,
      invoiceNumber: sale.invoice_number,
      currency: sale.currency,
    },
    amount: note.amount,
    observations:
      "Canal Mercado Libre. Ajuste de importe sin reposición automática de stock.",
    paymentCondition: "Mercado Libre",
    items: [
      {
        code: null,
        detail: note.reason ?? "Ajuste de importe Mercado Libre",
        quantity: 1,
        unitOfMeasure: null,
        weightQuantity: null,
        unitPrice: net,
        discountAmount: 0,
        discountPercent: 0,
        netAmount: net,
        taxAmount: sumMeliMoney(
          fiscalBreakdown.taxes.map((tax) => tax.taxAmount)
        ),
        totalAmount: note.amount,
      },
    ],
    taxes: fiscalBreakdown.taxes,
    fiscalBreakdown,
    sourceDocuments: [
      {
        invoiceNumber: sale.invoice_number,
        arcaPointOfSale: note.arca_associated_point_of_sale,
        arcaVoucherNumber: note.arca_associated_voucher_number,
        arcaVoucherTypeCode: note.arca_associated_voucher_type_code,
        arcaVoucherDate: note.arca_associated_voucher_date,
        appliedAmount: note.amount,
      },
    ],
    fiscal: {
      isAuthorized: true,
      number: fiscalNumber,
      cae: note.arca_cae,
      caeExpiresAt: note.arca_cae_expires_at,
      pointOfSale: note.arca_point_of_sale,
      voucherNumber: note.arca_voucher_number,
      voucherTypeCode: note.arca_voucher_type_code,
      currency: request.MonId,
      currencyRate: request.MonCotiz,
    },
  };
  return {
    html: await paginateFiscalInvoiceHtml(await generateCreditNoteHTML(data)),
    filename: `NC_Meli_${fiscalNumber}.pdf`,
  };
}
