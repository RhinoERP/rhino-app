import type { ChartKind, DatasetGroup } from "@/modules/reports/catalog";
import { SERIES_COLORS } from "./report-format";

/** Color de cada área del negocio en las tarjetas de reportes. */
export const GROUP_COLORS: Record<DatasetGroup, string> = {
  Ventas: SERIES_COLORS[0],
  Clientes: SERIES_COLORS[5],
  Cobranzas: SERIES_COLORS[2],
  Compras: SERIES_COLORS[4],
  Finanzas: SERIES_COLORS[3],
  Stock: SERIES_COLORS[1],
};

const W = 56;
const H = 36;

/** Dibujito del tipo de gráfico que trae el reporte. */
export function ChartGlyph({
  kind,
  ranking,
  color,
}: {
  kind: ChartKind;
  ranking: boolean;
  color: string;
}) {
  let body: React.ReactNode;
  if (kind === "pie") {
    body = (
      <>
        <circle
          cx={28}
          cy={18}
          fill="none"
          r={12}
          stroke={color}
          strokeOpacity={0.25}
          strokeWidth={7}
        />
        <circle
          cx={28}
          cy={18}
          fill="none"
          r={12}
          stroke={color}
          strokeDasharray="45 75"
          strokeWidth={7}
          transform="rotate(-90 28 18)"
        />
      </>
    );
  } else if (kind === "line" || kind === "area") {
    const path = "M4 28 L14 22 L24 25 L34 14 L44 17 L52 8";
    body = (
      <>
        {kind === "area" ? (
          <path d={`${path} L52 32 L4 32 Z`} fill={color} fillOpacity={0.18} />
        ) : null}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
        />
      </>
    );
  } else if (kind === "table") {
    body = [6, 14, 22, 30].map((y, i) => (
      <g key={y}>
        <rect
          fill={color}
          fillOpacity={0.25}
          height={4}
          rx={2}
          width={14}
          x={4}
          y={y - 2}
        />
        <rect
          fill={color}
          fillOpacity={0.7 - i * 0.12}
          height={4}
          rx={2}
          width={30 - i * 5}
          x={22}
          y={y - 2}
        />
      </g>
    ));
  } else if (ranking) {
    body = [7, 15, 23, 31].map((y, i) => (
      <rect
        fill={color}
        fillOpacity={1 - i * 0.2}
        height={5}
        key={y}
        rx={2.5}
        width={48 - i * 10}
        x={4}
        y={y - 3}
      />
    ));
  } else {
    body = [10, 18, 14, 26, 21, 30].map((h, i) => (
      <rect
        fill={color}
        fillOpacity={0.55 + (i % 2) * 0.35}
        height={h}
        key={`x${4 + i * 8.5}`}
        rx={1.5}
        width={6}
        x={4 + i * 8.5}
        y={H - 2 - h}
      />
    ));
  }
  return (
    <svg aria-hidden="true" height={H} viewBox={`0 0 ${W} ${H}`} width={W}>
      {body}
    </svg>
  );
}
