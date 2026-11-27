import type { Customer } from "@/modules/customers/types";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";

/** A query string may suggest a customer, but never grant access to one. */
export function resolvePreSaleCustomerContext({
  requestedCustomerId,
  visibleCustomers,
  sellers,
  userId,
  canAssignAnySeller,
}: {
  requestedCustomerId?: string;
  visibleCustomers: Pick<Customer, "id" | "assigned_seller_id">[];
  sellers: Pick<OrganizationMember, "user_id" | "is_active" | "disabled_at">[];
  userId: string | null;
  canAssignAnySeller: boolean;
}): { customerId?: string; sellerId?: string } {
  const sellerIds = sellers
    .filter((seller) => seller.is_active && !seller.disabled_at)
    .map((seller) => seller.user_id)
    .filter((id): id is string => Boolean(id));
  const defaultSellerId =
    (userId && sellerIds.includes(userId) ? userId : null) ?? sellerIds[0];
  const customer = visibleCustomers.find(
    (entry) => entry.id === requestedCustomerId
  );
  if (!customer) {
    return { sellerId: defaultSellerId };
  }

  const sellerId = customer.assigned_seller_id ?? defaultSellerId;
  if (
    !(sellerId && sellerIds.includes(sellerId)) ||
    (!canAssignAnySeller && sellerId !== userId)
  ) {
    return { sellerId: defaultSellerId };
  }

  return { customerId: customer.id, sellerId };
}
