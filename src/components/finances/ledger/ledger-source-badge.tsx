import { Badge } from "@/components/ui/badge";
import type { LedgerSource } from "@/modules/finances/types";

const SOURCE_CONFIG: Record<
  LedgerSource,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
  }
> = {
  cobro: { label: "Cobro", variant: "default" },
  credito_cliente: { label: "Crédito aplicado", variant: "secondary" },
  pago_proveedor: { label: "Pago proveedor", variant: "destructive" },
  gasto_operativo: { label: "Gasto operativo", variant: "outline" },
};

type Props = {
  source: LedgerSource;
};

export function LedgerSourceBadge({ source }: Props) {
  const cfg = SOURCE_CONFIG[source];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
