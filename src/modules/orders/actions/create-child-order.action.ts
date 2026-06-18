"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createChildOrder } from "../service/orders.service";
import type { ChildOrderRoute } from "../types";

export type CreateChildOrderInput = {
  orgSlug: string;
  parentOrderId: string;
  quoteItemIds: string[];
  route: ChildOrderRoute;
};

export type CreateChildOrderResult = {
  success: boolean;
  childOrderId?: string;
  childOrderNumber?: string;
  error?: string;
};

export async function createChildOrderAction(
  input: CreateChildOrderInput
): Promise<CreateChildOrderResult> {
  try {
    const { orgSlug } = input;
    const supabase = await createClient();
    const org = await getOrganizationBySlug(orgSlug);

    if (!org?.id) {
      throw new Error("Organización no encontrada");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("No autorizado");
    }

    const result = await createChildOrder(input);

    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
    revalidatePath(`/org/${orgSlug}/pedidos/${input.parentOrderId}`);

    return {
      success: true,
      childOrderId: result.childOrderId,
      childOrderNumber: result.childOrderNumber,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
