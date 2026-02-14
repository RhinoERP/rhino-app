"use server";

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
  customer_channel?: CustomerChannel;
  is_active?: boolean;
};

/**
 * Server action to update a customer
 */
export async function updateCustomerAction(
  params: UpdateCustomerActionParams
): Promise<UpdateCustomerActionResult> {
  try {
    const rawCustomerData: Partial<Omit<CreateCustomerInput, "orgSlug">> = {
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
      sales_price_list_id: params.sales_price_list_id,
      customer_channel: params.customer_channel,
      is_active: params.is_active,
    };

    const customerData = Object.fromEntries(
      Object.entries(rawCustomerData).filter(([, value]) => value !== undefined)
    ) as Partial<Omit<CreateCustomerInput, "orgSlug">>;

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
