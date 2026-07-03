"use server";

import { createClient } from "@/lib/supabase/server";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import type { OrderWithHistory } from "../types";

export async function getOrderDetailAction(
  orgSlug: string,
  orderId: string
): Promise<OrderWithHistory | null> {
  await guardOrganizationPermissionAccess(orgSlug, "orders.read");
  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgError || !org) {
    throw new Error("Organización no encontrada");
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      quotes!inner(
        id,
        total_amount,
        currency,
        payment_condition,
        customers!inner(
          business_name,
          fantasy_name
        ),
        quote_items(
          id,
          description,
          quantity,
          unit_price,
          subtotal,
          product_id
        )
      ),
      order_status_history(*),
      order_designs(*)
    `
    )
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .single();

  if (error) {
    throw new Error(`Error al obtener el pedido: ${error.message}`);
  }

  return data as unknown as OrderWithHistory;
}
