import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { updatePriceListPrices } from "@/modules/price-lists/service/price-lists.service";

type RouteParams = {
  params: Promise<{ orgSlug: string; priceListId: string }>;
};

const updateSchema = z
  .object({
    item_ids: z
      .array(z.uuid())
      .min(1, "Debe seleccionar al menos un producto")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Los productos no pueden estar duplicados"
      ),
    price: z.number().finite().nonnegative().optional(),
    amount_delta: z.number().finite().optional(),
    percentage: z.number().finite().gt(-100).optional(),
  })
  .refine(
    (value) =>
      [value.price, value.amount_delta, value.percentage].filter(
        (field) => field !== undefined
      ).length === 1,
    "Debe proporcionar una única estrategia: price, amount_delta o percentage"
  );

export async function POST(request: Request, { params }: RouteParams) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }
  const { orgSlug, priceListId } = await params;
  // Redirecting permission guards stay outside the business-error handler.
  await guardOrganizationPermissionAccess(orgSlug, "pricelists.manage");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }
  try {
    const count = await updatePriceListPrices({
      orgSlug,
      priceListId,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, updated_count: count });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron actualizar los precios",
      },
      { status: 500 }
    );
  }
}
