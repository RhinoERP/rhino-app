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
  business_name: string;
  fantasy_name?: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  credit_limit?: number;
  tax_condition?: string;
  client_number?: string;
};

/**
 * Server action to update a customer
 */
export async function updateCustomerAction(
  params: UpdateCustomerActionParams
): Promise<UpdateCustomerActionResult> {
  try {
    const customerData: Omit<CreateCustomerInput, "orgSlug"> = {
      business_name: params.business_name,
      fantasy_name: params.fantasy_name,
      cuit: params.cuit,
      phone: params.phone,
      email: params.email,
      address: params.address,
      city: params.city,
      credit_limit: params.credit_limit,
      tax_condition: params.tax_condition,
      client_number: params.client_number,
    };

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
