import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type ReceivablePaymentResponseRow = {
  account_receivable_id: string | null;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  source: "payment" | "credit";
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orgSlug = body?.orgSlug as string | undefined;
    const accountIds = (body?.accountIds ?? []) as string[];

    if (!(orgSlug && Array.isArray(accountIds))) {
      return NextResponse.json(
        { error: "Parámetros requeridos: orgSlug, accountIds" },
        { status: 400 }
      );
    }

    const filteredIds = accountIds.filter((id) => typeof id === "string");
    if (filteredIds.length === 0) {
      return NextResponse.json({ payments: [] });
    }

    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
      );
    }

    const supabase = await createClient();

    const { data: paymentsData, error: paymentsError } = await supabase
      .from("receivable_payments")
      .select(
        `
        account_receivable_id,
        amount,
        payment_method,
        payment_date,
        reference_number,
        notes,
        created_at
      `
      )
      .eq("organization_id", org.id)
      .in("account_receivable_id", filteredIds)
      .order("payment_date", { ascending: false });

    if (paymentsError) {
      return NextResponse.json(
        { error: `Error al obtener pagos: ${paymentsError.message}` },
        { status: 500 }
      );
    }

    const { data: creditsData, error: creditsError } = await supabase
      .from("customer_credit_applications")
      .select(
        `
        account_receivable_id,
        amount,
        payment_date,
        reference_number,
        notes,
        created_at
      `
      )
      .eq("organization_id", org.id)
      .in("account_receivable_id", filteredIds)
      .order("payment_date", { ascending: false });

    if (creditsError) {
      return NextResponse.json(
        {
          error: `Error al obtener créditos aplicados: ${creditsError.message}`,
        },
        { status: 500 }
      );
    }

    const payments: ReceivablePaymentResponseRow[] = (
      (paymentsData ?? []) as Omit<ReceivablePaymentResponseRow, "source">[]
    ).map((row) => ({
      ...row,
      source: "payment",
    }));

    const credits: ReceivablePaymentResponseRow[] = (
      (creditsData ?? []) as Omit<
        ReceivablePaymentResponseRow,
        "source" | "payment_method"
      >[]
    ).map((row) => ({
      ...row,
      payment_method: "cuenta corriente",
      source: "credit",
    }));

    return NextResponse.json({ payments: [...payments, ...credits] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error inesperado obteniendo pagos",
      },
      { status: 500 }
    );
  }
}
