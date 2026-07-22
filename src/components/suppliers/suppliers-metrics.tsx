import { HandshakeIcon } from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupplierMetrics } from "@/modules/suppliers/types";

type SuppliersMetricsProps = {
  metrics: SupplierMetrics;
};

export function SuppliersMetrics({ metrics }: SuppliersMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <HandshakeIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Total proveedores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.totalSuppliers}</div>
          <p className="text-muted-foreground text-xs">
            Proveedores registrados en la organización
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
