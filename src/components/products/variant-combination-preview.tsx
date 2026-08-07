"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { sortTalles } from "@/modules/inventory/utils/variant-utils";

export type VariantCombinationPreviewProps = {
  talles: string[];
  colores: string[];
  className?: string;
};

export function VariantCombinationPreview({
  talles,
  colores,
  className,
}: VariantCombinationPreviewProps) {
  if (talles.length === 0 || colores.length === 0) {
    return null;
  }

  const total = talles.length * colores.length;
  const orderedTalles = sortTalles(talles);

  return (
    <div className={cn("rounded-md border", className)}>
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
                {orderedTalles.map((talle) => (
                  <td
                    className="px-3 py-2 text-center"
                    key={`${color}-${talle}`}
                  >
                    <Check className="mx-auto size-4 text-primary" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t px-3 py-1.5 text-right text-muted-foreground text-xs">
        {total} {total === 1 ? "combinación" : "combinaciones"}
      </div>
    </div>
  );
}
