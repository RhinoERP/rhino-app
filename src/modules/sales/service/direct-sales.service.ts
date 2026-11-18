import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  createPosSale,
  getPosSaleById,
  getPosSalesByOrgSlug,
  searchPosProductsForTerminal,
} from "@/modules/pos/service/pos.service";
import { getPosTerminalsByOrgSlug } from "@/modules/pos/service/pos-terminals.service";
import type {
  CreateDirectSaleInput,
  CreateDirectSaleResult,
  DirectSale,
  DirectSaleDetail,
  DirectSaleProduct,
  DirectSaleTerminal,
} from "../types";

export async function getDirectSalesByOrgSlug(
  orgSlug: string,
  options?: {
    search?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ data: DirectSale[]; count: number }> {
  await ensure(READ_PERMISSIONS.pos, orgSlug);
  return getPosSalesByOrgSlug(orgSlug, options);
}

export async function getDirectSaleById(
  orgSlug: string,
  saleId: string
): Promise<DirectSaleDetail | null> {
  await ensure(READ_PERMISSIONS.pos, orgSlug);
  return getPosSaleById(orgSlug, saleId);
}

export async function searchDirectSaleProducts(params: {
  orgSlug: string;
  terminalId?: string;
  q?: string;
  barcode?: string;
  limit?: number;
}): Promise<DirectSaleProduct[]> {
  await ensure(READ_PERMISSIONS.pos, params.orgSlug);
  return searchPosProductsForTerminal(params);
}

export function getDirectSaleTerminalsByOrgSlug(
  orgSlug: string
): Promise<DirectSaleTerminal[]> {
  return getPosTerminalsByOrgSlug(orgSlug);
}

export function createDirectSale(
  input: CreateDirectSaleInput
): Promise<CreateDirectSaleResult> {
  return createPosSale(input);
}
