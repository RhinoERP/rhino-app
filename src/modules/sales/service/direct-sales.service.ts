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

export function getDirectSalesByOrgSlug(
  orgSlug: string
): Promise<DirectSale[]> {
  return getPosSalesByOrgSlug(orgSlug);
}

export function getDirectSaleById(
  orgSlug: string,
  saleId: string
): Promise<DirectSaleDetail | null> {
  return getPosSaleById(orgSlug, saleId);
}

export function searchDirectSaleProducts(params: {
  orgSlug: string;
  q?: string;
  barcode?: string;
  limit?: number;
}): Promise<DirectSaleProduct[]> {
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
