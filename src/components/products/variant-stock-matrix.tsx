"use client";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { sortTalles } from "@/modules/inventory/utils/variant-utils";

export type VariantStockMatrixProps = {
  talles: string[];
  colores: string[];
  stocks: Record<string, Record<string, number>>;

  readonly?: boolean;
  editable?: boolean;
  showStockWarning?: boolean;
  minStock?: number;
  maxValue?: number;

  isLoading?: boolean;
  errorMessage?: string | null;

  onChange?: (color: string, talle: string, value: number) => void;
  className?: string;
};

function LoadingSkeleton({
  talles,
  colores,
}: Pick<VariantStockMatrixProps, "talles" | "colores">) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="border-b bg-muted/50 px-3 py-2 text-left font-medium text-sm">
            <Skeleton className="h-4 w-12" />
          </th>
          {talles.map((talle) => (
            <th
              className="border-b bg-muted/50 px-3 py-2 text-center font-medium text-sm"
              key={talle}
            >
              <Skeleton className="mx-auto h-4 w-8" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {colores.map((color) => (
          <tr className="border-b" key={color}>
            <td className="bg-muted/30 px-3 py-2 font-medium text-sm">
              <Skeleton className="h-4 w-16" />
            </td>
            {talles.map((talle) => (
              <td className="px-3 py-2 text-center" key={talle}>
                <Skeleton className="mx-auto h-4 w-10" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function getStockValue(
  stocks: Record<string, Record<string, number>>,
  color: string,
  talle: string
): number {
  return stocks[color]?.[talle] ?? 0;
}

function isAllZero(
  stocks: Record<string, Record<string, number>>,
  talles: string[],
  colores: string[]
): boolean {
  return colores.every((color) =>
    talles.every((talle) => getStockValue(stocks, color, talle) === 0)
  );
}

export function VariantStockMatrix({
  talles,
  colores,
  stocks,
  readonly = true,
  editable = false,
  showStockWarning = false,
  minStock = 0,
  maxValue,
  isLoading = false,
  errorMessage = null,
  onChange,
  className,
}: VariantStockMatrixProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-md border", className)}>
        <LoadingSkeleton colores={colores} talles={talles} />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        className={cn(
          "rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm",
          className
        )}
      >
        {errorMessage}
      </div>
    );
  }

  if (talles.length === 0 || colores.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border px-3 py-6 text-center text-muted-foreground text-sm",
          className
        )}
      >
        Sin variantes configuradas.
      </div>
    );
  }

  const orderedTalles = sortTalles(talles);
  const allZero = isAllZero(stocks, talles, colores);

  return (
    <div className={cn("rounded-md border", className)}>
      {allZero && !editable && (
        <div className="border-b px-3 py-2 text-center text-muted-foreground text-sm">
          Sin stock
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-10 w-20 border-b bg-muted/50 px-3 py-2 text-left font-medium text-sm">
                &nbsp;
              </th>
              {orderedTalles.map((talle) => (
                <th
                  className="border-b bg-muted/50 px-3 py-2 text-center font-medium text-sm"
                  key={talle}
                >
                  {talle}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colores.map((color) => (
              <tr className="border-b last:border-b-0" key={color}>
                <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2 font-medium text-sm">
                  {color}
                </td>
                {orderedTalles.map((talle) => {
                  const value = getStockValue(stocks, color, talle);
                  const isLow =
                    showStockWarning && value > 0 && value <= minStock;
                  const isZero = value === 0;

                  if (readonly && !editable) {
                    return (
                      <td
                        className={cn(
                          "px-3 py-2 text-center text-sm tabular-nums",
                          isZero && "text-muted-foreground",
                          isLow && "font-medium text-destructive"
                        )}
                        key={talle}
                      >
                        {value}
                      </td>
                    );
                  }

                  return (
                    <td className="px-2 py-1 text-center" key={talle}>
                      <Input
                        className={cn(
                          "mx-auto w-16 text-center tabular-nums",
                          isLow && "border-destructive text-destructive"
                        )}
                        max={maxValue}
                        min={0}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          if (Number.isNaN(parsed)) {
                            onChange?.(color, talle, 0);
                          } else {
                            onChange?.(color, talle, Math.max(0, parsed));
                          }
                        }}
                        type="number"
                        value={value > 0 ? value : ""}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
