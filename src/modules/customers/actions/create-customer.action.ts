"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateCustomerInput,
  type CustomerChannel,
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
};

export async function createCustomerAction(
  params: CreateCustomerActionParams
): Promise<CreateCustomerActionResult> {
  await ensure("customers.manage", params.orgSlug);
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
      province: params.province,
      delivery_address: params.delivery_address,
      delivery_city: params.delivery_city,
      credit_limit: params.credit_limit,
      tax_condition: params.tax_condition,
      client_number: params.client_number,
      sales_price_list_id: params.sales_price_list_id,
      customer_channel: params.customer_channel,
      assigned_seller_id: params.assigned_seller_id,
      preferred_carrier_id: params.preferred_carrier_id,
      due_days: params.due_days,
    };

    const customer = await createCustomerForOrg(customerData);

    revalidatePath(`/org/${params.orgSlug}/clientes`);

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
