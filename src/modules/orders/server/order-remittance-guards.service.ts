import "server-only";

import { z } from "zod";

export async function documentedOrdersForParents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  parentIds: string[]
) {
  const result = await supabase
    .from("order_remittance_batches")
    .select(
      "parent_order_id, documents:order_remittances(status, lines:order_remittance_lines(sources:order_remittance_line_sources(order_id)))"
    )
    .eq("organization_id", orgId)
    .in("parent_order_id", [...new Set(parentIds)]);
  if (result.error) {
    throw new Error(result.error.message);
  }
  const blocked = new Set<string>();
  for (const batch of result.data) {
    for (const document of batch.documents.filter(
      (entry) => entry.status === "ISSUED"
    )) {
      blocked.add(batch.parent_order_id);
      for (const line of document.lines) {
        for (const source of line.sources) {
          blocked.add(source.order_id);
        }
      }
    }
  }
  return blocked;
}

import type { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export async function assertNoIssuedOrderRemittancesBySlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgSlug: string,
  orderId: string
) {
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    throw new Error("Organización no encontrada.");
  }
  await assertNoIssuedOrderRemittances(supabase, organization.id, orderId);
}

/** Must run before stock reentry or item unassignment, not after those writes. */
export async function assertNoIssuedOrderRemittances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  orderId: string
) {
  z.uuid().parse(orderId);
  const orders = await supabase
    .from("orders")
    .select("id")
    .eq("organization_id", orgId)
    .or(`id.eq.${orderId},parent_order_id.eq.${orderId}`);
  if (orders.error) {
    throw new Error(orders.error.message);
  }
  if (!orders.data.length) {
    throw new Error("Pedido no encontrado.");
  }
  const sources = await supabase
    .from("order_remittance_line_sources")
    .select(
      "id, line:order_remittance_lines!inner(remittance:order_remittances!inner(status))"
    )
    .eq("organization_id", orgId)
    .in(
      "order_id",
      orders.data.map((order) => order.id)
    )
    .eq("line.remittance.status", "ISSUED")
    .limit(1);
  if (sources.error) {
    throw new Error(sources.error.message);
  }
  if (sources.data.length) {
    throw new Error(
      "Este pedido tiene remitos activos. No se puede cancelar ni deshacer su creación; primero se debe resolver la documentación del despacho."
    );
  }
}
