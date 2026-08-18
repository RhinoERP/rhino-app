"use client";

import Link from "next/link";
import { useState } from "react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { createSalesAdvanceAction } from "@/modules/sales-advances/actions/create-sales-advance.action";
import { issuePreventaBalanceAction } from "@/modules/sales-advances/actions/issue-preventa-balance.action";
import {
  useSalesAdvance,
  useSalesAdvanceSuggestion,
} from "@/modules/sales-advances/hooks/use-sales-advance";
import {
  formatSalesAdvancePercentage,
  salesAdvanceStatusLabels,
} from "@/modules/sales-advances/types";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dialog state and fiscal actions are co-located for this compact card.
export function SalesAdvanceCard(props: {
  orgSlug: string;
  saleId: string;
  total: number;
  canManage: boolean;
  canIssueBalance?: boolean;
}) {
  const { data: advance, refetch } = useSalesAdvance(
    props.orgSlug,
    props.saleId
  );
  const { data: suggestion } = useSalesAdvanceSuggestion(
    props.orgSlug,
    props.saleId
  );
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState("");
  const [pending, setPending] = useState(false);
  const [issuingBalance, setIssuingBalance] = useState(false);
  const numericAmount = Number(amount);
  const numericPercentage = Number(percentage);

  const updateAmount = (value: string) => {
    setAmount(value);
    const nextAmount = Number(value);
    if (Number.isFinite(nextAmount) && nextAmount >= 0 && props.total > 0) {
      setPercentage(
        String(Number(((nextAmount * 100) / props.total).toFixed(4)))
      );
      return;
    }
    setPercentage("");
  };

  const updatePercentage = (value: string) => {
    setPercentage(value);
    const nextPercentage = Number(value);
    if (
      Number.isFinite(nextPercentage) &&
      nextPercentage >= 0 &&
      nextPercentage <= 100
    ) {
      setAmount(
        String(Number(((props.total * nextPercentage) / 100).toFixed(2)))
      );
    }
  };

  const create = async () => {
    setPending(true);
    try {
      await createSalesAdvanceAction({
        orgSlug: props.orgSlug,
        preventaId: props.saleId,
        amount: numericAmount,
        percentage: Number.isFinite(numericPercentage)
          ? numericPercentage
          : undefined,
      });
      await refetch();
      setOpen(false);
      toast.success("Anticipo creado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo crear el anticipo"
      );
    } finally {
      setPending(false);
    }
  };

  const remaining = advance
    ? Math.max(0, props.total - advance.amount)
    : props.total;

  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-lg">Anticipo</CardTitle>
          <CardDescription>
            Factura A, B o C genérica sin impacto de stock; la venta final se
            factura por el total.
          </CardDescription>
        </div>
        <Badge variant="outline">
          {advance
            ? salesAdvanceStatusLabels[advance.status]
            : "No configurado"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {advance ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Importe</p>
                <p className="font-medium">{formatCurrency(advance.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Porcentaje</p>
                <p className="font-medium">
                  {formatSalesAdvancePercentage(advance.percentageSnapshot)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo estimado</p>
                <p className="font-medium">{formatCurrency(remaining)}</p>
              </div>
            </div>
            {advance.lastError ? (
              <p className="text-destructive text-xs">{advance.lastError}</p>
            ) : null}
            <Button asChild size="sm">
              <Link
                href={`/org/${props.orgSlug}/ventas/${props.saleId}/anticipo`}
              >
                Ver / gestionar anticipo
              </Link>
            </Button>
            {advance.originType === "PREVENTA" ? (
              <Button
                disabled={!props.canManage}
                onClick={() => setOpen(true)}
                size="sm"
                variant="outline"
              >
                Agregar anticipo
              </Button>
            ) : null}
            {props.canIssueBalance && advance.originType === "PREVENTA" ? (
              <Button
                disabled={!props.canManage || issuingBalance}
                onClick={async () => {
                  setIssuingBalance(true);
                  try {
                    await issuePreventaBalanceAction({
                      orgSlug: props.orgSlug,
                      preventaId: props.saleId,
                    });
                    toast.success("Factura de saldo emitida");
                    await refetch();
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "No se pudo emitir la factura de saldo"
                    );
                  } finally {
                    setIssuingBalance(false);
                  }
                }}
                size="sm"
                variant="secondary"
              >
                {issuingBalance ? "Emitiendo saldo..." : "Facturar saldo"}
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            disabled={!props.canManage}
            onClick={() => {
              if (!amount && suggestion?.amount) {
                setAmount(String(suggestion.amount));
                setPercentage(
                  String(
                    suggestion.percentage ??
                      Number(
                        ((suggestion.amount * 100) / props.total).toFixed(4)
                      )
                  )
                );
              }
              setOpen(true);
            }}
            size="sm"
          >
            Generar anticipo
          </Button>
        )}
      </CardContent>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar anticipo</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            El importe se factura con el concepto genérico “Anticipo de
            producción”, sin productos ni SKU, y no afecta el stock.
          </p>
          <div className="space-y-2">
            <Label htmlFor="advance-amount">Importe del anticipo</Label>
            <Input
              id="advance-amount"
              min="0.01"
              onChange={(event) => updateAmount(event.target.value)}
              step="0.01"
              type="number"
              value={amount}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advance-percentage">Porcentaje del anticipo</Label>
            <Input
              id="advance-percentage"
              max="100"
              min="0.01"
              onChange={(event) => updatePercentage(event.target.value)}
              step="0.01"
              type="number"
              value={percentage}
            />
          </div>
          {suggestion?.amount ? (
            <p className="text-muted-foreground text-xs">
              Sugerido por presupuesto: {suggestion.percentage}% ·{" "}
              {formatCurrency(suggestion.amount)}
            </p>
          ) : null}
          <p className="text-muted-foreground text-sm">
            Total: {formatCurrency(props.total)} · Saldo estimado:{" "}
            {formatCurrency(
              Math.max(
                0,
                props.total -
                  (Number.isFinite(numericAmount) ? numericAmount : 0)
              )
            )}
          </p>
          <DialogFooter>
            <Button
              disabled={
                pending ||
                !(numericAmount > 0 && numericAmount <= props.total) ||
                (percentage !== "" &&
                  !(numericPercentage >= 0 && numericPercentage <= 100))
              }
              onClick={create}
            >
              Crear anticipo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
