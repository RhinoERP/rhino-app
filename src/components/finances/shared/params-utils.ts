import type {
  FinancialPeriod,
  FinancialPeriodKey,
} from "@/modules/finances/types";

export function getPeriodFromParams(params: URLSearchParams): FinancialPeriod {
  const key = (params.get("periodo") as FinancialPeriodKey) ?? "este-mes";
  const now = new Date();

  if (key === "custom") {
    return {
      from:
        params.get("desde") ??
        toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: params.get("hasta") ?? toISODate(now),
      label: "Período personalizado",
    };
  }

  return buildPeriod(key, now);
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function buildPeriod(key: FinancialPeriodKey, now: Date): FinancialPeriod {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case "mes-anterior": {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return {
        from: toISODate(start),
        to: toISODate(end),
        label: "Mes anterior",
      };
    }
    case "trimestre": {
      const q = Math.floor(m / 3);
      const start = new Date(y, q * 3, 1);
      const end = new Date(y, q * 3 + 3, 0);
      return {
        from: toISODate(start),
        to: toISODate(end),
        label: "Este trimestre",
      };
    }
    case "este-año": {
      return {
        from: toISODate(new Date(y, 0, 1)),
        to: toISODate(now),
        label: "Este año",
      };
    }
    default: {
      const start = new Date(y, m, 1);
      return { from: toISODate(start), to: toISODate(now), label: "Este mes" };
    }
  }
}
