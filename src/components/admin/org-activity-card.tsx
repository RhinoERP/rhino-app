"use client";

import type { OrgActivityMetrics } from "@/modules/admin/service/activity.service";

type MetricKey =
  | "ventas"
  | "compras"
  | "mov_stock"
  | "cobros"
  | "clientes_nuevos"
  | "productos_nuevos"
  | "notas_credito"
  | "gastos"
  | "pos";

const METRICS: {
  key: MetricKey;
  label: string;
  color: string;
  has7d: boolean;
}[] = [
  {
    key: "ventas",
    label: "Ventas realizadas",
    color: "text-blue-600",
    has7d: true,
  },
  {
    key: "compras",
    label: "Órdenes de compra",
    color: "text-violet-600",
    has7d: true,
  },
  {
    key: "mov_stock",
    label: "Movimientos de stock",
    color: "text-amber-600",
    has7d: true,
  },
  {
    key: "cobros",
    label: "Cobros registrados",
    color: "text-green-600",
    has7d: false,
  },
  {
    key: "clientes_nuevos",
    label: "Clientes nuevos",
    color: "text-cyan-600",
    has7d: false,
  },
  {
    key: "productos_nuevos",
    label: "Productos nuevos",
    color: "text-orange-600",
    has7d: false,
  },
  {
    key: "notas_credito",
    label: "Notas de crédito",
    color: "text-pink-600",
    has7d: false,
  },
  {
    key: "gastos",
    label: "Gastos registrados",
    color: "text-red-600",
    has7d: false,
  },
  {
    key: "pos",
    label: "Ventas POS",
    color: "text-indigo-600",
    has7d: true,
  },
];

const FIELD_7D: Record<MetricKey, keyof OrgActivityMetrics | null> = {
  ventas: "ventas_7d",
  compras: "compras_7d",
  mov_stock: "mov_stock_7d",
  cobros: null,
  clientes_nuevos: null,
  productos_nuevos: null,
  notas_credito: null,
  gastos: null,
  pos: "pos_7d",
};

const FIELD_30D: Record<MetricKey, keyof OrgActivityMetrics> = {
  ventas: "ventas_30d",
  compras: "compras_30d",
  mov_stock: "mov_stock_30d",
  cobros: "cobros_30d",
  clientes_nuevos: "clientes_nuevos_30d",
  productos_nuevos: "productos_nuevos_30d",
  notas_credito: "notas_credito_30d",
  gastos: "gastos_30d",
  pos: "pos_30d",
};

type OrgActivityCardProps = {
  metrics: OrgActivityMetrics;
};

export function OrgActivityCard({ metrics }: OrgActivityCardProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="p-6">
        <h3 className="mb-4 font-semibold">Actividad reciente</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left font-medium">Métrica</th>
                <th className="py-2 text-right font-medium">7 días</th>
                <th className="py-2 text-right font-medium">30 días</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map(({ key, label, color, has7d }) => (
                <tr className="border-b last:border-0" key={key}>
                  <td className={`py-2.5 font-medium ${color}`}>{label}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {has7d && FIELD_7D[key]
                      ? (metrics[FIELD_7D[key]] ?? 0)
                      : "\u2014"}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {metrics[FIELD_30D[key]] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
