"use server";

import {
  type CreateCustomerInput,
  updateCustomerById,
} from "../service/customers.service";
import type { Customer } from "../types";

export type UpdateCustomerActionResult = {
  success: boolean;
  error?: string;
  customer?: Customer;
};

export type UpdateCustomerActionParams = {
  customerId: string;
  business_name?: string;
  fantasy_name?: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  credit_limit?: number;
  tax_condition?: string;
  client_number?: string;
  sales_price_list_id?: string | null;
  assigned_seller_id?: string | null;
  preferred_carrier_id?: string | null;
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
      "credit_limit",
      "tax_condition",
      "client_number",
      "sales_price_list_id",
      "assigned_seller_id",
      "preferred_carrier_id",
      "is_active",
    ] as const;

    const customerData: Partial<Omit<CreateCustomerInput, "orgSlug">> = {};
    for (const field of fields) {
      if (params[field] !== undefined) {
        (customerData as Record<string, unknown>)[field] = params[field];
      }
    }

    const customer = await updateCustomerById(params.customerId, customerData);

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
