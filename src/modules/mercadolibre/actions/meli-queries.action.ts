"use server";

import { revalidatePath } from "next/cache";
import {
  saveMeliWarehouseConfiguration,
  searchMeliCustomers,
  searchMeliProducts,
} from "../service/meli-read.service";
import { previewMercadoLibreSale } from "../service/mercadolibre-sales.service";
import type { CreateMeliSaleInput } from "../types";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación.";
}
export async function searchMeliProductsAction(
  orgSlug: string,
  search: string
) {
  try {
    return {
      success: true as const,
      data: await searchMeliProducts(orgSlug, search),
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
export async function searchMeliCustomersAction(
  orgSlug: string,
  search: string
) {
  try {
    return {
      success: true as const,
      data: await searchMeliCustomers(orgSlug, search),
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
export async function previewMeliSaleAction(input: CreateMeliSaleInput) {
  try {
    return {
      success: true as const,
      data: await previewMercadoLibreSale(input),
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
export async function saveMeliWarehouseAction(
  orgSlug: string,
  warehouseId: string
) {
  try {
    await saveMeliWarehouseConfiguration(orgSlug, warehouseId);
    revalidatePath(`/org/${orgSlug}/configuracion/venta-directa`);
    revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
