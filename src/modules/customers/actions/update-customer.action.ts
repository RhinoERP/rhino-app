"use server";

import { revalidatePath } from "next/cache";
import {
  type CreateCustomerInput,
  type CustomerChannel,
  updateCustomerById,
} from "../service/customers.service";
import type { Customer } from "../types";

export type UpdateCustomerActionResult = {
  success: boolean;
  error?: string;
  customer?: Customer;
};

export type UpdateCustomerActionParams = {
  orgSlug: string;
  customerId: string;
  business_name?: string;
  fantasy_name?: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  credit_limit?: number;
  tax_condition?: string;
  client_number?: string;
  sales_price_list_id?: string | null;
  customer_channel?: CustomerChannel;
  assigned_seller_id?: string | null;
  preferred_carrier_id?: string | null;
  due_days?: number | null;
  is_active?: boolean;
};

/**
 * Server action to update a customer
 */
export async function updateCustomerAction(
  params: UpdateCustomerActionParams
): Promise<UpdateCustomerActionResult> {
  try {
    const fields = [
      "business_name",
      "fantasy_name",
      "cuit",
      "phone",
      "email",
      "address",
      "city",
      "province",
      "delivery_address",
      "delivery_city",
      "credit_limit",
      "tax_condition",
      "client_number",
      "sales_price_list_id",
      "customer_channel",
      "assigned_seller_id",
      "preferred_carrier_id",
      "due_days",
      "is_active",
    ] as const;

    const customerData: Partial<Omit<CreateCustomerInput, "orgSlug">> = {};
    for (const field of fields) {
      if (params[field] !== undefined) {
        (customerData as Record<string, unknown>)[field] = params[field];
      }
    }

    const customer = await updateCustomerById(params.customerId, customerData);

    revalidatePath(`/org/${params.orgSlug}/clientes`);

    return {
      success: true,
      customer,
    };
  } catch (error) {
    console.error("Error updating customer:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el cliente",
    };
  }
}
