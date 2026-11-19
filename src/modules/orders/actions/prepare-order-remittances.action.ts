"use server";

import { z } from "zod";
import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import { createTypedAdminClient as createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { RemittanceData } from "@/modules/sales/service/remittance-generator.service";
import {
  fetchOrderRemittanceRows,
  getOrderRemittanceData,
} from "../server/order-remittance-pdf-document.service";
import { resolveOrdersAccessContext } from "../service/orders.service";
import {
  type PlannedRemittanceDocument,
  planRemittanceDocuments,
} from "../utils/remittance-document-plan";

const prepareSchema = z.object({
  orgSlug: z.string().trim().min(1),
  childOrderIds: z.array(z.uuid()).min(1),
});
const unitSchema = z.enum(["UN", "KG", "LT", "MT"]);

export type PreparedOrderRemittances = {
  automaticNumbering: boolean;
  parentOrderId: string;
  childOrderIds: string[];
  sourceFingerprint: string;
  header: Omit<
    RemittanceData,
    "items" | "documentNumber" | "subtotal" | "discountTotal" | "total"
  >;
  carrierName: string | null;
  documents: PlannedRemittanceDocument[];
};

type PrepareResult =
  | { success: true; data: PreparedOrderRemittances }
  | { success: false; error: string };

function preparationConfiguration(
  settings: Awaited<ReturnType<typeof getOrganizationSettings>>,
  numbering: Awaited<ReturnType<typeof getRemittanceSettings>>
) {
  if (
    !(
      settings.success &&
      settings.data?.remittance_mask_printing_enabled &&
      numbering.success &&
      numbering.data
    )
  ) {
    throw new Error(
      "No se pudo validar la configuración de remitos con máscara."
    );
  }
  return {
    automaticNumbering: numbering.data.autoEnabled,
    percentage: settings.data.dispatch_declared_value_percentage,
  };
}

function assertEveryOrderHasItems(
  ids: string[],
  rows: Awaited<ReturnType<typeof fetchOrderRemittanceRows>>
) {
  const populatedOrders = new Set(
    rows.map((row) => row.source.assigned_order_id)
  );
  if (ids.some((id) => !populatedOrders.has(id))) {
    throw new Error(
      "Uno de los subpedidos no tiene productos para documentar."
    );
  }
}

async function validateParentForPreparation(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  parentOrderId: string;
  quoteId: string | null;
  userId: string | null;
  scope: "own" | "all";
}) {
  const parent = await params.supabase
    .from("orders")
    .select("id, created_by, quote_id, status")
    .eq("organization_id", params.orgId)
    .eq("id", params.parentOrderId)
    .single();
  if (
    parent.error ||
    !parent.data ||
    parent.data.quote_id !== params.quoteId ||
    ["CANCELLED", "DELIVERED", "FINANCE_REJECTED"].includes(
      parent.data.status
    ) ||
    (params.scope !== "all" && parent.data.created_by !== params.userId)
  ) {
    throw new Error("El pedido padre no está disponible para este despacho.");
  }
}

/** Read-only: prepares a plan; no counter, event, state or document is mutated. */
export async function prepareOrderRemittancesAction(
  input: z.input<typeof prepareSchema>
): Promise<PrepareResult> {
  try {
    const parsed = prepareSchema.parse(input);
    await ensure("orders.dispatch", parsed.orgSlug);
    const ids = [...new Set(parsed.childOrderIds)].sort();
    const org = await getOrganizationBySlug(parsed.orgSlug);
    if (!org) {
      throw new Error("Organización no encontrada.");
    }
    const supabase = await createClient();
    const access = await resolveOrdersAccessContext(supabase, parsed.orgSlug);
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, parent_order_id, status, created_by, quote_id")
      .eq("organization_id", org.id)
      .in("id", ids);
    if (error) {
      throw new Error(error.message);
    }
    if (!orders || orders.length !== ids.length) {
      throw new Error("Uno o más subpedidos no fueron encontrados.");
    }
    const parentOrderId = orders[0].parent_order_id;
    if (
      !parentOrderId ||
      orders.some(
        (order) =>
          order.parent_order_id !== parentOrderId ||
          order.quote_id !== orders[0].quote_id ||
          order.status !== "PREPARING"
      )
    ) {
      throw new Error("Seleccioná subpedidos en preparación del mismo pedido.");
    }
    if (
      access.scope !== "all" &&
      orders.some((order) => order.created_by !== access.userId)
    ) {
      throw new Error("La selección incluye pedidos fuera de tu alcance.");
    }
    await validateParentForPreparation({
      supabase,
      orgId: org.id,
      parentOrderId,
      quoteId: orders[0].quote_id,
      userId: access.userId,
      scope: access.scope,
    });
    const admin = createAdminClient();
    const fingerprintArgs = { p_org_id: org.id, p_order_ids: ids };
    const before = await admin.rpc(
      "order_remittance_source_fingerprint",
      fingerprintArgs
    );
    if (before.error || !before.data) {
      throw new Error("No se pudo verificar el contenido del despacho.");
    }
    const [rows, documentData, settings, numbering] = await Promise.all([
      fetchOrderRemittanceRows(supabase, org.id, ids),
      getOrderRemittanceData({
        orgSlug: parsed.orgSlug,
        childOrderIds: ids,
        remitoNumber: "",
      }),
      getOrganizationSettings(parsed.orgSlug),
      getRemittanceSettings(parsed.orgSlug),
    ]);
    const configuration = preparationConfiguration(settings, numbering);
    assertEveryOrderHasItems(ids, rows);
    const declaredValuePercentage = configuration.percentage;
    const documents = planRemittanceDocuments(
      rows.map(({ source, item, commercialQuantity }) => {
        if (
          !(source.assigned_order_id && ids.includes(source.assigned_order_id))
        ) {
          throw new Error("Un ítem dejó de pertenecer al despacho.");
        }
        // Never copy the weight of an entire commercial line onto a split child.
        const weightQuantity = item.weightQuantity;
        if (
          weightQuantity != null &&
          (!commercialQuantity || commercialQuantity <= 0)
        ) {
          throw new Error(
            "No se pudo distribuir el peso comercial de un producto."
          );
        }
        return {
          source: {
            id: source.id,
            orderId: source.assigned_order_id,
            product_id: source.product_id,
            product_variant_id: source.product_variant_id,
          },
          item: {
            ...item,
            unitOfMeasure: unitSchema.parse(item.unitOfMeasure),
            weightQuantity:
              weightQuantity == null
                ? null
                : truncateToDecimals(
                    (weightQuantity * item.quantity) /
                      (commercialQuantity ?? 1),
                    6
                  ),
          },
        };
      })
    );
    const after = await admin.rpc(
      "order_remittance_source_fingerprint",
      fingerprintArgs
    );
    if (after.error || after.data !== before.data) {
      throw new Error(
        "El despacho cambió durante la preparación. Volvé a intentarlo."
      );
    }
    const { remittance, carrierName } = documentData;
    return {
      success: true,
      data: {
        automaticNumbering: configuration.automaticNumbering,
        parentOrderId,
        childOrderIds: ids,
        sourceFingerprint: before.data,
        carrierName,
        documents: documents.map((document) => ({
          ...document,
          suggestedDeclaredValue: truncateMoney(
            (document.total * declaredValuePercentage) / 100
          ),
        })),
        header: {
          type: remittance.type,
          date: remittance.date,
          currency: remittance.currency,
          invoiceNumber: remittance.invoiceNumber,
          issuer: remittance.issuer,
          customer: remittance.customer,
          seller: remittance.seller,
          taxesTotal: remittance.taxesTotal,
          observations: remittance.observations,
          singlePageDuplicate: remittance.singlePageDuplicate,
          showProductBrand: remittance.showProductBrand,
          finalRemittanceVisibility: remittance.finalRemittanceVisibility,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron preparar los remitos.",
    };
  }
}
