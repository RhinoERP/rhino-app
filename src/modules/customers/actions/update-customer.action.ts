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
  is_active?: boolean;
};

/**
 * Server action to update a customer
 */
export async function updateCustomerAction(
  params: UpdateCustomerActionParams
): Promise<UpdateCustomerActionResult> {
  try {
    const customerData: Partial<Omit<CreateCustomerInput, "orgSlug">> = {};

    if (params.business_name !== undefined) {
      customerData.business_name = params.business_name;
    }
    if (params.fantasy_name !== undefined) {
      customerData.fantasy_name = params.fantasy_name;
    }
    if (params.cuit !== undefined) {
      customerData.cuit = params.cuit;
    }
    if (params.phone !== undefined) {
      customerData.phone = params.phone;
    }
    if (params.email !== undefined) {
      customerData.email = params.email;
    }
    if (params.address !== undefined) {
      customerData.address = params.address;
    }
    if (params.city !== undefined) {
      customerData.city = params.city;
    }
    if (params.credit_limit !== undefined) {
      customerData.credit_limit = params.credit_limit;
    }
    if (params.tax_condition !== undefined) {
      customerData.tax_condition = params.tax_condition;
    }
    if (params.client_number !== undefined) {
      customerData.client_number = params.client_number;
    }
    if (params.sales_price_list_id !== undefined) {
      customerData.sales_price_list_id = params.sales_price_list_id;
    }
    if (params.is_active !== undefined) {
      customerData.is_active = params.is_active;
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
