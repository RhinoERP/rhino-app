"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { upsertSupplierCommissionRateAction } from "@/modules/commissions/actions/upsert-supplier-commission-rate.action";
import type { SupplierCommissionRateRow } from "@/modules/commissions/service/supplier-commission-rates.service";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import type { Supplier } from "@/modules/suppliers/types";

type SupplierCommissionRatesGridProps = {
  orgSlug: string;
  members: OrganizationMember[];
  suppliers: Supplier[];
  rates: SupplierCommissionRateRow[];
};

function sellerLabel(member: OrganizationMember): string {
  return member.user?.name || member.user?.email || member.user_id;
}

function RateCell({
  orgSlug,
  sellerId,
  supplierId,
  rate,
}: {
  orgSlug: string;
  sellerId: string;
  supplierId: string;
  rate: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rate);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const result = await upsertSupplierCommissionRateAction(
      orgSlug,
      sellerId,
      supplierId,
      value
    );
    setSaving(false);

    if (result.success) {
      setEditing(false);
      toast.success("Comisión por proveedor actualizada");
    } else {
      toast.error(result.error ?? "Error al actualizar");
    }
  }, [value, orgSlug, sellerId, supplierId]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          className="h-8 w-16"
          disabled={saving}
          max={100}
          min={0}
          onChange={(e) => setValue(Number.parseFloat(e.target.value) || 0)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSave();
            }
            if (e.key === "Escape") {
              setValue(rate);
              setEditing(false);
            }
          }}
          type="number"
          value={value === 0 ? "" : value}
        />
        <span className="text-muted-foreground text-xs">%</span>
        <Button
          disabled={saving}
          onClick={handleSave}
          size="sm"
          variant="ghost"
        >
          {saving ? "..." : "✓"}
        </Button>
      </div>
    );
  }

  return (
    <button
      className="cursor-pointer rounded px-1.5 py-0.5 text-sm hover:bg-muted"
      onClick={() => {
        setValue(rate);
        setEditing(true);
      }}
      type="button"
    >
      {rate}%
    </button>
  );
}

export function SupplierCommissionRatesGrid({
  orgSlug,
  members,
  suppliers,
  rates,
}: SupplierCommissionRatesGridProps) {
  const rateByKey = new Map(
    rates.map((r) => [`${r.seller_id}|${r.supplier_id}`, r.rate])
  );

  if (suppliers.length === 0) {
    return (
      <div className="rounded-md border p-6 text-muted-foreground text-sm">
        No hay proveedores activos en esta organización.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[160px]">Vendedor</TableHead>
            {suppliers.map((supplier) => (
              <TableHead className="min-w-[120px]" key={supplier.id}>
                {supplier.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.user_id}>
              <TableCell className="font-medium">
                {sellerLabel(member)}
              </TableCell>
              {suppliers.map((supplier) => (
                <TableCell key={supplier.id}>
                  <RateCell
                    orgSlug={orgSlug}
                    rate={
                      rateByKey.get(`${member.user_id}|${supplier.id}`) ?? 0
                    }
                    sellerId={member.user_id}
                    supplierId={supplier.id}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
