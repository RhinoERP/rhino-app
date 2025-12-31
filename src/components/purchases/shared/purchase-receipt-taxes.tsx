"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Tax } from "@/modules/taxes/service/taxes.service";

type PurchaseReceiptTaxesProps = {
  allTaxes: Tax[];
  selectedTaxIds: string[];
  onToggleTax: (taxId: string) => void;
};

export function PurchaseReceiptTaxes({
  allTaxes,
  selectedTaxIds,
  onToggleTax,
}: PurchaseReceiptTaxesProps) {
  if (allTaxes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Impuestos</CardTitle>
        <CardDescription>
          Seleccione los impuestos que aplican a esta compra
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {allTaxes.map((tax) => (
          <div className="flex items-center space-x-2" key={tax.id}>
            <Checkbox
              checked={selectedTaxIds.includes(tax.id)}
              id={`tax-${tax.id}`}
              onCheckedChange={() => onToggleTax(tax.id)}
            />
            <Label
              className="flex-1 cursor-pointer font-normal text-sm"
              htmlFor={`tax-${tax.id}`}
            >
              {tax.name} ({tax.rate}%)
            </Label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
