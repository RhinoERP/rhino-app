"use server";

import { getAssignmentsByCustomer } from "../service/assignments.service";
import type { CustomerSupplierAssignment } from "../types";

export async function getAssignmentsByCustomerAction(
  orgSlug: string,
  customerId: string
): Promise<CustomerSupplierAssignment[]> {
  try {
    return await getAssignmentsByCustomer(orgSlug, customerId);
  } catch {
    return [];
  }
}
