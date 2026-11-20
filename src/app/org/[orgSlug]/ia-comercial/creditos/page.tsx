import Link from "next/link";
import { redirect } from "next/navigation";
import { UsagePanel } from "@/components/commercial-ai/usage-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resolveCommercialAiAccess } from "@/modules/commercial-ai/service/commercial-ai.service";
import {
  type PurchaseOutcome,
  settleCreditPayment,
} from "@/modules/commercial-ai/service/credit-purchases.service";
import { getUsageSummary } from "@/modules/commercial-ai/service/usage.service";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const numberFormat = new Intl.NumberFormat("es-AR");
const TONE_CLASS = {
  ok: "border-emerald-500/50",
  bad: "border-destructive/50",
  wait: "border-amber-500/50",
} as const;

/** Mercado Pago vuelve con payment_id (o collection_id en versiones viejas). */
function paymentIdOf(
  query: Record<string, string | string[] | undefined>
): string | null {
  for (const key of ["payment_id", "collection_id"]) {
    const value = query[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

function outcomeText(outcome: PurchaseOutcome): {
  tone: "ok" | "wait" | "bad";
  text: string;
} {
  switch (outcome.state) {
    case "acreditada":
    case "ya-acreditada":
      return {
        tone: "ok",
        text: `Pago aprobado: se acreditaron ${numberFormat.format(outcome.credits)} créditos.`,
      };
    case "pendiente":
      return {
        tone: "wait",
        text: "El pago está en proceso. Los créditos se acreditan solos cuando Mercado Pago lo apruebe.",
      };
    case "rechazada":
      return {
        tone: "bad",
        text: "El pago fue rechazado. No se cobró nada; podés intentar con otro medio.",
      };
    default:
      return {
        tone: "wait",
        text: "Todavía no tenemos la confirmación del pago. Si pagaste, los créditos se acreditan solos en unos minutos.",
      };
  }
}

/** Créditos de IA Comercial: saldo, compra y vuelta desde Mercado Pago. */
export default async function CreditsPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const query = (await searchParams) ?? {};
  const access = await resolveCommercialAiAccess(orgSlug);
  if (!access) {
    redirect(`/org/${orgSlug}`);
  }
  if (access.role !== "gerente") {
    redirect(`/org/${orgSlug}/ia-comercial`);
  }
  const paymentId = paymentIdOf(query);
  const outcome =
    paymentId && paymentId !== "null"
      ? await settleCreditPayment(paymentId, access.organizationId).catch(
          (): PurchaseOutcome => ({ state: "desconocida" })
        )
      : null;
  const usage = await getUsageSummary(access.organizationId);
  const message = outcome ? outcomeText(outcome) : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-2xl">Créditos de IA Comercial</h1>
        <Button asChild className="ml-auto" size="sm" variant="outline">
          <Link href={`/org/${orgSlug}/ia-comercial`}>
            Volver a IA Comercial
          </Link>
        </Button>
      </div>
      {message ? (
        <Card className={`p-4 text-sm ${TONE_CLASS[message.tone]}`}>
          {message.text}
        </Card>
      ) : null}
      <UsagePanel orgSlug={orgSlug} usage={usage} />
    </div>
  );
}
