/**
 * KPI Card Component
 * Card para mostrar métricas clave con indicadores de cambio
 */

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KPICardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  percentageChange?: number;
  icon?: React.ReactNode;
  format?: "number" | "currency" | "percentage";
  className?: string;
};

export function KPICard({
  title,
  value,
  subtitle,
  percentageChange,
  icon,
  format = "number",
  className,
}: KPICardProps) {
  const formattedValue = formatValue(value, format);
  const isPositive = percentageChange !== undefined && percentageChange > 0;
  const isNegative = percentageChange !== undefined && percentageChange < 0;
  const hasChange = percentageChange !== undefined && percentageChange !== 0;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-sm">{title}</CardTitle>
        {icon && <div className="size-4 text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">{formattedValue}</div>
        {subtitle && (
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        )}
        {hasChange && (
          <div className="mt-2 flex items-center text-xs">
            {isPositive && (
              <>
                <ArrowUpIcon className="mr-1 size-3 text-green-600" />
                <span className="font-medium text-green-600">
                  +{percentageChange.toFixed(1)}%
                </span>
              </>
            )}
            {isNegative && (
              <>
                <ArrowDownIcon className="mr-1 size-3 text-red-600" />
                <span className="font-medium text-red-600">
                  {percentageChange.toFixed(1)}%
                </span>
              </>
            )}
            <span className="ml-1 text-muted-foreground">
              vs período anterior
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatValue(
  value: string | number,
  format: "number" | "currency" | "percentage"
): string {
  if (typeof value === "string") {
    return value;
  }

  switch (format) {
    case "currency": {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    case "percentage": {
      return `${value.toFixed(1)}%`;
    }
    default: {
      return new Intl.NumberFormat("es-AR").format(value);
    }
  }
}
