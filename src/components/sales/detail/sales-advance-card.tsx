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
  useSalesAdvanceSuggestion,
  useSalesAdvanceSummary,
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
  currency?: string;
  canManage: boolean;
  canIssueBalance?: boolean;
}) {
  const { data: summary, refetch } = useSalesAdvanceSummary(
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
  const advances = summary?.advances ?? [];
  const latestAdvance = advances[0] ?? null;
  const displayCurrency = props.currency ?? latestAdvance?.currency ?? "ARS";
  const remaining = summary?.remainingAmount ?? props.total;
  let statusLabel = "No configurado";
  if (latestAdvance) {
    statusLabel =
      advances.length === 1
        ? salesAdvanceStatusLabels[latestAdvance.status]
        : `${advances.length} anticipos`;
  }

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
        <Badge variant="outline">{statusLabel}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {latestAdvance ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Anticipado</p>
                <p className="font-medium">
                  {formatCurrency(
                    summary?.committedAmount ?? 0,
                    displayCurrency
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Último anticipo</p>
                <p className="font-medium">
                  {formatCurrency(latestAdvance.amount, displayCurrency)} ·{" "}
                  {formatSalesAdvancePercentage(
                    latestAdvance.percentageSnapshot
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo estimado</p>
                <p className="font-medium">
                  {formatCurrency(remaining, displayCurrency)}
                </p>
              </div>
            </div>
            {advances.length > 1 ? (
              <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
                {advances.map((advance) => (
                  <div className="flex justify-between gap-3" key={advance.id}>
                    <Link
                      className="hover:underline"
                      href={`/org/${props.orgSlug}/ventas/${props.saleId}/anticipo?advanceId=${advance.id}`}
                    >
                      {salesAdvanceStatusLabels[advance.status]}
                    </Link>
                    <span className="font-medium">
                      {formatCurrency(advance.amount, displayCurrency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {advances.find((advance) => advance.lastError)?.lastError ? (
              <p className="text-destructive text-xs">
                {advances.find((advance) => advance.lastError)?.lastError}
              </p>
            ) : null}
            <Button asChild size="sm">
              <Link
                href={`/org/${props.orgSlug}/ventas/${props.saleId}/anticipo?advanceId=${latestAdvance.id}`}
              >
                Ver / gestionar anticipos
              </Link>
            </Button>
            {latestAdvance.originType === "PREVENTA" && remaining > 0 ? (
              <Button
                disabled={!props.canManage}
                onClick={() => setOpen(true)}
                size="sm"
                variant="outline"
              >
                Agregar anticipo
              </Button>
            ) : null}
            {props.canIssueBalance &&
            latestAdvance.originType === "PREVENTA" ? (
              <Button
                disabled={
                  !props.canManage ||
                  issuingBalance ||
                  Boolean(summary?.hasUnresolvedAdvance)
                }
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
            {summary?.hasUnresolvedAdvance ? (
              <p className="text-muted-foreground text-xs">
                Emití o resolvé todos los anticipos antes de facturar el saldo.
              </p>
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
              {formatCurrency(suggestion.amount, displayCurrency)}
            </p>
          ) : null}
          <p className="text-muted-foreground text-sm">
            Total: {formatCurrency(props.total, displayCurrency)} · Saldo
            estimado:{" "}
            {formatCurrency(
              Math.max(
                0,
                remaining - (Number.isFinite(numericAmount) ? numericAmount : 0)
              ),
              displayCurrency
            )}
          </p>
          <DialogFooter>
            <Button
              disabled={
                pending ||
                !(numericAmount > 0 && numericAmount <= remaining) ||
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
