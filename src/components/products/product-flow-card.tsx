"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  GearIcon,
  WarningIcon,
} from "@phosphor-icons/react/ssr";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { updateProductFlowAction } from "@/modules/inventory/actions/product-flow.actions";

// Plan de cuentas contable — cuentas habilitadas para artículos
export const ACCOUNTING_ACCOUNTS = [
  { code: "1.1.04", name: "Mercadería de Reventa", allowedForProducts: true },
  { code: "1.1.05", name: "Materia Prima", allowedForProducts: true },
  { code: "1.1.06", name: "Productos en Proceso", allowedForProducts: true },
  { code: "1.1.07", name: "Productos Terminados", allowedForProducts: true },
  // Cuentas BLOQUEADAS para artículos (solo referencias, no seleccionables)
  { code: "2.1.03", name: "IIBB a Pagar", allowedForProducts: false },
  { code: "5.1.01", name: "Gastos Bancarios", allowedForProducts: false },
  { code: "4.1.01", name: "Honorarios", allowedForProducts: false },
  { code: "2.1.01", name: "IVA a Pagar", allowedForProducts: false },
] as const;

type ProductFlowCardProps = {
  orgSlug: string;
  productId: string;
  canSell: boolean;
  canBuy: boolean;
  canProduce: boolean;
  accountingAccountCode: string | null;
  accountingAccountName: string | null;
};

export function ProductFlowCard({
  orgSlug,
  productId,
  canSell: initialCanSell,
  canBuy: initialCanBuy,
  canProduce: initialCanProduce,
  accountingAccountCode: initialCode,
  accountingAccountName: _initialName,
}: ProductFlowCardProps) {
  const [canSell, setCanSell] = useState(initialCanSell);
  const [canBuy, setCanBuy] = useState(initialCanBuy);
  const [canProduce, setCanProduce] = useState(initialCanProduce);
  const [accountCode, setAccountCode] = useState(initialCode ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{
    field: "can_sell" | "can_buy" | "can_produce";
    value: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedAccount = ACCOUNTING_ACCOUNTS.find(
    (a) => a.code === accountCode
  );

  function handleToggleIntent(
    field: "can_sell" | "can_buy" | "can_produce",
    value: boolean
  ) {
    // Si se está deshabilitando, pedir confirmación
    if (value) {
      applyToggle(field, value);
    } else {
      setPendingToggle({ field, value });
      setConfirmOpen(true);
    }
  }

  function applyToggle(
    field: "can_sell" | "can_buy" | "can_produce",
    value: boolean
  ) {
    const newSell = field === "can_sell" ? value : canSell;
    const newBuy = field === "can_buy" ? value : canBuy;
    const newProduce = field === "can_produce" ? value : canProduce;

    if (field === "can_sell") {
      setCanSell(value);
    }
    if (field === "can_buy") {
      setCanBuy(value);
    }
    if (field === "can_produce") {
      setCanProduce(value);
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: maneja actualización + revert optimista con tres campos independientes de flujo
    startTransition(async () => {
      const result = await updateProductFlowAction({
        orgSlug,
        productId,
        can_sell: newSell,
        can_buy: newBuy,
        can_produce: newProduce,
        accounting_account_code: accountCode || null,
        accounting_account_name: selectedAccount?.name ?? null,
      });
      if (result.success) {
        toast.success("Permisos de flujo actualizados");
      } else {
        toast.error(result.error ?? "Error al actualizar");
        // revert
        if (field === "can_sell") {
          setCanSell(!value);
        }
        if (field === "can_buy") {
          setCanBuy(!value);
        }
        if (field === "can_produce") {
          setCanProduce(!value);
        }
      }
    });
  }

  function handleAccountChange(code: string) {
    const account = ACCOUNTING_ACCOUNTS.find((a) => a.code === code);
    if (!account?.allowedForProducts) {
      return; // nunca debería pasar, pero por seguridad
    }
    setAccountCode(code);
    startTransition(async () => {
      const result = await updateProductFlowAction({
        orgSlug,
        productId,
        can_sell: canSell,
        can_buy: canBuy,
        can_produce: canProduce,
        accounting_account_code: code,
        accounting_account_name: account.name,
      });
      if (result.success) {
        toast.success("Cuenta contable actualizada");
      } else {
        toast.error(result.error ?? "Error al actualizar la cuenta contable");
        setAccountCode(initialCode ?? "");
      }
    });
  }

  const allowedAccounts = ACCOUNTING_ACCOUNTS.filter(
    (a) => a.allowedForProducts
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GearIcon className="size-4" weight="duotone" />
            Configuración de flujo y contabilidad
          </CardTitle>
          <CardDescription>
            Controlá en qué procesos puede participar este artículo y a qué
            cuenta contable se imputa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Toggles de flujo */}
          <div className="space-y-3">
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
              Habilitaciones de flujo
            </p>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <ArrowUpIcon className="size-4 text-blue-500" weight="bold" />
                <div>
                  <p className="font-medium text-sm">Se vende</p>
                  <p className="text-muted-foreground text-xs">
                    Aparece en presupuestos y ventas
                  </p>
                </div>
              </div>
              <Switch
                checked={canSell}
                disabled={isPending}
                onCheckedChange={(v) => handleToggleIntent("can_sell", v)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <ArrowDownIcon
                  className="size-4 text-orange-500"
                  weight="bold"
                />
                <div>
                  <p className="font-medium text-sm">Se compra</p>
                  <p className="text-muted-foreground text-xs">
                    Aparece en órdenes de compra
                  </p>
                </div>
              </div>
              <Switch
                checked={canBuy}
                disabled={isPending}
                onCheckedChange={(v) => handleToggleIntent("can_buy", v)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <GearIcon className="size-4 text-purple-500" weight="bold" />
                <div>
                  <p className="font-medium text-sm">Se produce</p>
                  <p className="text-muted-foreground text-xs">
                    Aparece en órdenes de producción
                  </p>
                </div>
              </div>
              <Switch
                checked={canProduce}
                disabled={isPending}
                onCheckedChange={(v) => handleToggleIntent("can_produce", v)}
              />
            </div>
          </div>

          {/* Cuenta contable */}
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
              Cuenta contable
            </p>
            <Select
              disabled={isPending}
              onValueChange={handleAccountChange}
              value={accountCode}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta..." />
              </SelectTrigger>
              <SelectContent>
                {allowedAccounts.map((account) => (
                  <SelectItem key={account.code} value={account.code}>
                    <span className="mr-2 font-mono text-muted-foreground text-xs">
                      {account.code}
                    </span>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {accountCode && (
              <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
                <Badge className="font-mono text-xs" variant="outline">
                  {accountCode}
                </Badge>
                <span>{selectedAccount?.name}</span>
              </div>
            )}

            {!accountCode && (
              <div className="mt-1 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-600 text-xs">
                <WarningIcon className="size-3.5 shrink-0" weight="fill" />
                <span>
                  Sin cuenta contable asignada. Los movimientos de este artículo
                  no se imputarán correctamente.
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmación al deshabilitar */}
      <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WarningIcon className="size-5 text-amber-500" weight="fill" />
              Confirmar deshabilitación
            </DialogTitle>
            <DialogDescription>
              {pendingToggle?.field === "can_sell" &&
                "Al deshabilitar 'Se vende', este artículo no podrá agregarse a nuevos presupuestos ni ventas."}
              {pendingToggle?.field === "can_buy" &&
                "Al deshabilitar 'Se compra', este artículo no aparecerá en nuevas órdenes de compra."}
              {pendingToggle?.field === "can_produce" &&
                "Al deshabilitar 'Se produce', este artículo no estará disponible en producción."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                setPendingToggle(null);
              }}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (pendingToggle) {
                  applyToggle(pendingToggle.field, pendingToggle.value);
                }
                setConfirmOpen(false);
                setPendingToggle(null);
              }}
              variant="destructive"
            >
              Sí, deshabilitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
