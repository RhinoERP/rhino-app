"use server";

import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { OrderWithDetails } from "../types";

export async function getOrdersAction(
  orgSlug: string
): Promise<OrderWithDetails[]> {
  await ensure("orders.read", orgSlug);
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
        customers(
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
      )
    `
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener los pedidos: ${error.message}`);
  }

  return (data ?? []) as unknown as OrderWithDetails[];
}
