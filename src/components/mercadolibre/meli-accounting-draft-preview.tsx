import type { MeliAccountingBreakdown } from "@/modules/mercadolibre/utils/accounting-breakdown";
import {
  buildMeliAccountingComponents,
  type MeliAccountingComponent,
} from "@/modules/mercadolibre/utils/accounting-components";

function accountLabel(account: MeliAccountingComponent["debit"]): string {
  return account.kind === "semantic"
    ? account.code
    : `Cuenta seleccionada ${account.id}`;
}

export function MeliAccountingDraftPreview({
  grossAmount,
  currency,
  breakdown,
}: {
  grossAmount: string;
  currency: "ARS" | "USD";
  breakdown: MeliAccountingBreakdown;
}) {
  let components: MeliAccountingComponent[];
  try {
    components = buildMeliAccountingComponents(grossAmount, breakdown);
  } catch {
    return (
      <p className="text-destructive" role="alert">
        El borrador guardado no es válido o no coincide con su importe bruto. No
        puede utilizarse para contabilizar y requiere revisión.
      </p>
    );
  }
  return (
    <details>
      <summary className="cursor-pointer">Vista previa de conceptos</summary>
      <p className="mt-2 text-muted-foreground">Cuentas propuestas.</p>
      <ul className="mt-2 space-y-2">
        {components.map((component) => (
          <li key={component.key}>
            <p>
              {component.description}: {component.amount} {currency}
            </p>
            <p>Debe: {accountLabel(component.debit)}</p>
            <p>Haber: {accountLabel(component.credit)}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
