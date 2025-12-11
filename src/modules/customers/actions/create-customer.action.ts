"use server";

import {
  type CreateCustomerInput,
  createCustomerForOrg,
} from "../service/customers.service";
import type { Customer } from "../types";

export type CreateCustomerActionResult = {
  success: boolean;
  error?: string;
  customer?: Customer;
};

export type CreateCustomerActionParams = {
  orgSlug: string;
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

export async function createCustomerAction(
  params: CreateCustomerActionParams
): Promise<CreateCustomerActionResult> {
  try {
    const customerData: CreateCustomerInput = {
      orgSlug: params.orgSlug,
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

    const customer = await createCustomerForOrg(customerData);

    return {
      success: true,
      customer,
    };
  } catch (error) {
    console.error("Error creating customer:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear el cliente",
    };
  }
}
