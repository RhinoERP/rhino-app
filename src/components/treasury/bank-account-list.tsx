"use client";

import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TreasuryBankAccount } from "@/lib/accounting-client";
import { formatCurrency } from "@/lib/format";
import { toggleBankAccountEstadoAction } from "@/modules/treasury/actions/bank-accounts.action";
import { useCuentasBancarias } from "@/modules/treasury/queries/queries.client";
import { BankAccountFormDialog } from "./bank-account-form-dialog";

type Props = {
  orgId: string;
  orgSlug: string;
};

function ToggleEstadoButton({
  cuenta,
  orgSlug,
}: {
  cuenta: TreasuryBankAccount;
  orgSlug: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Switch
      checked={cuenta.activa}
      disabled={isPending}
      onCheckedChange={(checked) => {
        startTransition(async () => {
          const result = await toggleBankAccountEstadoAction(
            orgSlug,
            cuenta.id,
            checked
          );
          if (result.success) {
            toast.success(checked ? "Cuenta activada" : "Cuenta desactivada");
          } else {
            toast.error(result.error);
          }
        });
      }}
    />
  );
}

export function BankAccountList({ orgId, orgSlug }: Props) {
  const {
    data: cuentas = [],
    isLoading,
    isError,
    refetch,
  } = useCuentasBancarias(orgId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<
    TreasuryBankAccount | undefined
  >();

  function handleEdit(cuenta: TreasuryBankAccount) {
    setEditingCuenta(cuenta);
    setDialogOpen(true);
  }

  if (isLoading) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        Cargando cuentas bancarias...
      </p>
    );
  }

  if (isError) {
    return (
      <p className="py-8 text-center text-destructive text-sm">
        Error al cargar cuentas bancarias
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Cuentas bancarias</h2>
        <Button
          className="gap-2"
          onClick={() => {
            setEditingCuenta(undefined);
            setDialogOpen(true);
          }}
          size="sm"
        >
          <PlusIcon className="h-4 w-4" />
          Nueva cuenta
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Banco</TableHead>
              <TableHead>N° / CBU</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Saldo operativo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuentas.length === 0 && (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground text-sm"
                  colSpan={7}
                >
                  Sin cuentas bancarias configuradas
                </TableCell>
              </TableRow>
            )}
            {cuentas.map((cuenta) => (
              <TableRow
                className={cuenta.activa ? "" : "opacity-60"}
                key={cuenta.id}
              >
                <TableCell className="font-medium">{cuenta.nombre}</TableCell>
                <TableCell className="text-sm">{cuenta.banco}</TableCell>
                <TableCell className="font-mono text-sm">
                  {cuenta.numero_cuenta ?? cuenta.alias ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{cuenta.moneda}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(Number(cuenta.saldo_operativo))}
                </TableCell>
                <TableCell>
                  <ToggleEstadoButton cuenta={cuenta} orgSlug={orgSlug} />
                </TableCell>
                <TableCell>
                  <Button
                    className="h-7 w-7"
                    onClick={() => handleEdit(cuenta)}
                    size="icon"
                    variant="ghost"
                  >
                    <PencilSimpleIcon className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <BankAccountFormDialog
        cuenta={editingCuenta}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingCuenta(undefined);
          }
        }}
        onSuccess={() => refetch()}
        open={dialogOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </div>
  );
}
