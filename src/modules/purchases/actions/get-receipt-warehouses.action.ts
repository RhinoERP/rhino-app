"use server";

import { z } from "zod";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  getReceiptProductVariants,
  getReceiptWarehouseContext,
} from "../service/receipt-warehouse.service";

export async function getReceiptWarehousesAction(
  orgSlug: string,
  purchaseOrderId: string
) {
  await ensure("purchases.manage", orgSlug);
  z.uuid().parse(purchaseOrderId);
  return getReceiptWarehouseContext(orgSlug, purchaseOrderId);
}

export async function getReceiptVariantsAction(
  orgSlug: string,
  productId: string
) {
  await ensure("purchases.manage", orgSlug);
  z.uuid().parse(productId);
  return getReceiptProductVariants(orgSlug, productId);
}
