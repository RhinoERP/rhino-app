/** The seller can see their own customers and those available to be assigned. */
export function customerSellerScopeFilter(userId: string): string {
  return `assigned_seller_id.eq.${userId},assigned_seller_id.is.null`;
}
