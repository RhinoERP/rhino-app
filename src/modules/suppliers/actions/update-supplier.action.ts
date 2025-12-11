"use server";

import type { Supplier } from "../service/suppliers.service";
import {
  type UpdateSupplierInput,
  updateSupplierForOrg,
} from "../service/suppliers.service";

export type UpdateSupplierActionResult = {
  success: boolean;
  error?: string;
  supplier?: Supplier;
};

export type UpdateSupplierActionParams = {
  supplierId: string;
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

export async function updateSupplierAction(
  params: UpdateSupplierActionParams
): Promise<UpdateSupplierActionResult> {
  try {
    const supplierData: UpdateSupplierInput = {
      supplierId: params.supplierId,
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

    const supplier = await updateSupplierForOrg(supplierData);

    return {
      success: true,
      supplier,
    };
  } catch (error) {
    console.error("Error updating supplier:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el proveedor",
    };
  }
}
