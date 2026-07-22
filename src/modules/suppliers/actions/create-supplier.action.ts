"use server";

import type { Supplier } from "../service/suppliers.service";
import {
  type CreateSupplierInput,
  createSupplierForOrg,
} from "../service/suppliers.service";

export type CreateSupplierActionResult = {
  success: boolean;
  error?: string;
  supplier?: Supplier;
};

export type CreateSupplierActionParams = {
  orgSlug: string;
  name: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_name?: string;
  payment_terms?: string;
  notes?: string;
};

export async function createSupplierAction(
  params: CreateSupplierActionParams
): Promise<CreateSupplierActionResult> {
  try {
    const supplierData: CreateSupplierInput = {
      orgSlug: params.orgSlug,
      name: params.name,
      cuit: params.cuit,
      phone: params.phone,
      email: params.email,
      address: params.address,
      contact_name: params.contact_name,
      payment_terms: params.payment_terms,
      notes: params.notes,
    };

    const supplier = await createSupplierForOrg(supplierData);

    return {
      success: true,
      supplier,
    };
  } catch (error) {
    console.error("Error creating supplier:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear el proveedor",
    };
  }
}
