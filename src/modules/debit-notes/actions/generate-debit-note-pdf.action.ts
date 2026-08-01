"use server";

import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import {
  buildCreditNotePDFData,
  generateCreditNoteHTML,
} from "@/modules/credit-notes/service/credit-note-pdf.service";
import type { CreditNote } from "@/modules/credit-notes/types";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getDebitNoteById } from "../service/debit-notes.service";

function getPaymentConditionLabel(value: "CASH" | "CURRENT_ACCOUNT" | null) {
  if (value === "CASH") {
    return "Contado";
  }
  if (value === "CURRENT_ACCOUNT") {
    return "Cuenta corriente";
  }
  return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: adapts the generic credit-note printer to the fiscal ND shape.
export async function generateDebitNotePDFAction(
  orgSlug: string,
  debitNoteId: string
) {
  try {
    const [debitNote, organization] = await Promise.all([
      getDebitNoteById(orgSlug, debitNoteId),
      getOrganizationBySlug(orgSlug),
    ]);
    if (!debitNote) {
      return {
        success: false as const,
        error: "Nota de Débito no encontrada.",
      };
    }
    if (debitNote.status !== "authorized") {
      return {
        success: false as const,
        error:
          "El PDF fiscal se habilita cuando ARCA autoriza la Nota de Débito.",
      };
    }
    const settings = organization?.id
      ? await getOrganizationArcaSettingsByOrganizationId(organization.id)
      : null;
    const printable = {
      id: debitNote.id,
      organizationId: debitNote.organizationId,
      salesOrderId: debitNote.salesOrderId,
      customerId: debitNote.customerId,
      salesReturnId: null,
      purchaseTargetCreditId: null,
      originType: "MANUAL_ADJUSTMENT",
      reason: debitNote.reasonDetail ?? debitNote.reason,
      creditNoteNumber: debitNote.debitNoteNumber,
      issueDate: debitNote.issueDate,
      amount: debitNote.amount,
      invoiceType: debitNote.invoiceType,
      observations:
        [
          debitNote.concept ? `Concepto: ${debitNote.concept}` : null,
          debitNote.observations,
        ]
          .filter(Boolean)
          .join("\n") || null,
      status: "CONFIRMED",
      isHistorical: false,
      createdAt: debitNote.createdAt,
      arcaStatus: "authorized",
      arcaCae: debitNote.arcaCae,
      arcaCaeExpiresAt: debitNote.arcaCaeExpiresAt,
      arcaAuthorizedAt: debitNote.arcaAuthorizedAt,
      arcaPointOfSale: debitNote.arcaPointOfSale,
      arcaVoucherNumber: debitNote.arcaVoucherNumber,
      arcaVoucherTypeCode: debitNote.arcaVoucherTypeCode,
      arcaLastError: null,
      arcaAssociatedVoucherTypeCode: null,
      arcaAssociatedPointOfSale: null,
      arcaAssociatedVoucherNumber: null,
      arcaAssociatedVoucherDate: null,
      invoiceEmailStatus: "not_sent",
      invoiceEmailRecipient: debitNote.customer?.email ?? null,
      invoiceEmailSentAt: null,
      invoiceEmailDeliveredAt: null,
      invoiceEmailLastAttemptAt: null,
      invoiceEmailLastEvent: null,
      invoiceEmailLastEventAt: null,
      invoiceEmailLastError: null,
      items: debitNote.items.length
        ? debitNote.items.map((item) => ({
            id: item.id,
            creditNoteId: debitNote.id,
            salesOrderId: debitNote.salesOrderId,
            salesOrderItemId: null,
            salesReturnItemId: null,
            productId: null,
            productName: null,
            productSku: null,
            productUnitOfMeasure: null,
            weightQuantity: null,
            discountPercent: null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: 0,
            netAmount: item.netAmount,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          }))
        : [
            {
              id: debitNote.id,
              creditNoteId: debitNote.id,
              salesOrderId: debitNote.salesOrderId,
              salesOrderItemId: null,
              salesReturnItemId: null,
              productId: null,
              productName: null,
              productSku: null,
              productUnitOfMeasure: null,
              weightQuantity: null,
              discountPercent: null,
              description: `Cargo adicional: ${debitNote.reasonDetail ?? debitNote.reason}`,
              quantity: 1,
              unitPrice: debitNote.amount,
              discountAmount: 0,
              netAmount: debitNote.amount,
              taxAmount: 0,
              totalAmount: debitNote.amount,
            },
          ],
      taxes: debitNote.taxes.map((tax) => ({
        id: tax.id,
        creditNoteId: debitNote.id,
        taxId: tax.taxId ?? null,
        name: tax.name,
        rate: tax.rate,
        baseAmount: tax.baseAmount,
        taxAmount: tax.taxAmount,
        taxCodeSnapshot: tax.taxCodeSnapshot ?? null,
      })),
      sourceDocuments: [],
      customer: debitNote.customer
        ? {
            id: debitNote.customerId,
            businessName: debitNote.customer.businessName,
            fantasyName: debitNote.customer.fantasyName,
            email: debitNote.customer.email,
            cuit: null,
            taxCondition: null,
            address: null,
            city: null,
            clientNumber: null,
            dueDays: null,
          }
        : null,
      sale: debitNote.sale
        ? {
            saleNumber: debitNote.sale.saleNumber,
            invoiceNumber: debitNote.sale.invoiceNumber,
            invoiceType: debitNote.invoiceType,
            totalAmount: debitNote.amount,
            arcaStatus: debitNote.sale.arcaStatus,
            arcaPointOfSale: null,
            arcaVoucherNumber: null,
            arcaVoucherTypeCode: null,
            arcaAuthorizedAt: null,
          }
        : null,
    } as unknown as CreditNote;
    const data = buildCreditNotePDFData({
      creditNote: printable,
      issuerName: organization?.name ?? "Empresa",
      issuerCuit: organization?.cuit,
      returnItems: null,
      branding: {
        issuerBusinessName: settings?.issuer_business_name ?? null,
        issuerLegalAddress: settings?.issuer_legal_address ?? null,
        issuerLogoUrl: settings?.issuer_logo_data_url ?? null,
      },
    });
    data.paymentCondition = getPaymentConditionLabel(
      debitNote.paymentCondition
    );
    data.dueDate = debitNote.dueDate;
    data.externalReference = debitNote.externalReference;
    const html = (await generateCreditNoteHTML(data))
      .replaceAll("NOTA DE CREDITO", "NOTA DE DEBITO")
      .replaceAll("Nota de Crédito", "Nota de Débito");
    return {
      success: true as const,
      html,
      debitNoteNumber: debitNote.debitNoteNumber,
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error ? error.message : "No se pudo generar el PDF.",
    };
  }
}
