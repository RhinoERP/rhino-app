"use client";

import { TargetIcon } from "@phosphor-icons/react";
import { CircleHelp } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { calculatePurchaseTargetCreditAction } from "@/modules/credit-notes/actions/calculate-purchase-target-credit.action";
import { createPurchaseTargetCreditNoteAction } from "@/modules/credit-notes/actions/create-purchase-target-credit-note.action";
import type {
  CalculatePurchaseTargetCreditResult,
  PurchaseTargetBenefitType,
} from "@/modules/credit-notes/service/purchase-target-credit.service";
import type { Customer } from "@/modules/customers/types";

type PurchaseTargetCreditNoteDialogProps = {
  orgSlug: string;
  customers: Customer[];
};

type HelpTooltipProps = {
  label: string;
  children: ReactNode;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIsoDate() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function HelpTooltip({ children, label }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/70 transition hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          type="button"
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        className="max-w-[279px] bg-black text-white [&>svg]:bg-black [&>svg]:fill-black"
        side="top"
        sideOffset={6}
      >
        <div className="space-y-1 text-left text-xs leading-relaxed">
          {children}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function PurchaseTargetCreditNoteDialog({
  orgSlug,
  customers,
}: PurchaseTargetCreditNoteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStartIsoDate);
  const [periodEnd, setPeriodEnd] = useState(todayIsoDate);
  const [thresholdAmount, setThresholdAmount] = useState("");
  const [benefitType, setBenefitType] =
    useState<PurchaseTargetBenefitType>("percentage");
  const [benefitValue, setBenefitValue] = useState("");
  const [observations, setObservations] = useState("");
  const [calculation, setCalculation] =
    useState<CalculatePurchaseTargetCreditResult | null>(null);
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isCalculating, setIsCalculating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId),
    [customerId, customers]
  );
  const canCreate =
    calculation?.qualifies === true && selectedSaleIds.size > 0 && !isCreating;

  function reset() {
    setCustomerId("");
    setPeriodStart(monthStartIsoDate());
    setPeriodEnd(todayIsoDate());
    setThresholdAmount("");
    setBenefitType("percentage");
    setBenefitValue("");
    setObservations("");
    setCalculation(null);
    setSelectedSaleIds(new Set());
  }

  async function handleCalculate() {
    if (!(customerId && periodStart && periodEnd)) {
      toast.error("Seleccioná cliente y período.");
      return;
    }

    const parsedThreshold = Number.parseFloat(thresholdAmount || "0");
    const parsedBenefit = Number.parseFloat(benefitValue || "0");

    if (parsedBenefit <= 0) {
      toast.error("Ingresá un beneficio mayor a cero.");
      return;
    }

    setIsCalculating(true);
    try {
      const result = await calculatePurchaseTargetCreditAction({
        orgSlug,
        customerId,
        periodStart,
        periodEnd,
        thresholdAmount: Number.isFinite(parsedThreshold) ? parsedThreshold : 0,
        benefitType,
        benefitValue: parsedBenefit,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setCalculation(result.data);
      setSelectedSaleIds(
        new Set(result.data.eligibleSales.map((sale) => sale.id))
      );
      if (result.data.qualifies) {
        toast.success("Objetivo calculado correctamente.");
      } else {
        toast.error("El cliente no cumple el objetivo indicado.");
      }
    } finally {
      setIsCalculating(false);
    }
  }

  async function handleCreate() {
    if (!calculation) {
      return;
    }

    setIsCreating(true);
    try {
      const result = await createPurchaseTargetCreditNoteAction({
        orgSlug,
        customerId: calculation.customerId,
        periodStart: calculation.periodStart,
        periodEnd: calculation.periodEnd,
        thresholdAmount: calculation.thresholdAmount,
        benefitType,
        benefitValue: Number.parseFloat(benefitValue || "0"),
        selectedSalesOrderIds: Array.from(selectedSaleIds),
        observations: observations.trim() || null,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Nota de crédito ${result.data.creditNoteNumber} generada por objetivo`
      );
      router.refresh();
      setOpen(false);
      reset();
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <TargetIcon className="mr-2 size-4" weight="bold" />
          NC por objetivo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nota de crédito por objetivo</DialogTitle>
          <DialogDescription>
            Calculá ventas elegibles y confirmá las facturas asociadas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="target-customer">Cliente</Label>
              <HelpTooltip label="Cómo se usa el cliente">
                <p>
                  El objetivo se calcula sólo con ventas de este cliente dentro
                  del período elegido.
                </p>
              </HelpTooltip>
            </div>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              id="target-customer"
              onChange={(event) => {
                setCustomerId(event.target.value);
                setCalculation(null);
                setSelectedSaleIds(new Set());
              }}
              value={customerId}
            >
              <option value="">Seleccioná un cliente...</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fantasy_name ??
                    customer.business_name ??
                    "Cliente sin nombre"}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="target-start">Desde</Label>
              <HelpTooltip label="Qué ventas entran en el período">
                <p>Se toman ventas con fecha entre Desde y Hasta, inclusive.</p>
                <p>
                  Sólo cuentan las ventas confirmadas, despachadas o entregadas
                  con ARCA autorizada.
                </p>
              </HelpTooltip>
            </div>
            <Input
              id="target-start"
              onChange={(event) => setPeriodStart(event.target.value)}
              type="date"
              value={periodStart}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="target-end">Hasta</Label>
              <HelpTooltip label="Qué ventas quedan fuera">
                <p>
                  Las ventas fuera del rango, sin comprobante ARCA autorizado o
                  en estados no válidos no se suman al objetivo.
                </p>
              </HelpTooltip>
            </div>
            <Input
              id="target-end"
              onChange={(event) => setPeriodEnd(event.target.value)}
              type="date"
              value={periodEnd}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="target-threshold">Objetivo mínimo</Label>
              <HelpTooltip label="Cómo funciona el objetivo mínimo">
                <p>
                  Es el mínimo de ventas elegibles que el cliente debe alcanzar.
                </p>
                <p>
                  Si el total elegible es menor a este importe, no se habilita
                  la generación de la NC.
                </p>
              </HelpTooltip>
            </div>
            <Input
              id="target-threshold"
              min={0}
              onChange={(event) => setThresholdAmount(event.target.value)}
              placeholder="0.00"
              step={0.01}
              type="number"
              value={thresholdAmount}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="target-benefit-type">Beneficio</Label>
              <HelpTooltip label="Cómo se calcula el beneficio">
                <p>
                  Porcentaje calcula la NC sobre el total de ventas elegibles
                  del período.
                </p>
                <p>
                  Monto fijo genera ese importe completo cuando el cliente
                  cumple el objetivo.
                </p>
              </HelpTooltip>
            </div>
            <div className="flex gap-2">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                id="target-benefit-type"
                onChange={(event) =>
                  setBenefitType(
                    event.target.value as PurchaseTargetBenefitType
                  )
                }
                value={benefitType}
              >
                <option value="percentage">Porcentaje</option>
                <option value="fixed_amount">Monto fijo</option>
              </select>
              <Input
                min={0}
                onChange={(event) => setBenefitValue(event.target.value)}
                placeholder={benefitType === "percentage" ? "5" : "0.00"}
                step={0.01}
                type="number"
                value={benefitValue}
              />
            </div>
          </div>
        </div>

        <Button
          disabled={isCalculating}
          onClick={handleCalculate}
          type="button"
        >
          {isCalculating ? "Calculando..." : "Calcular objetivo"}
        </Button>

        {calculation && (
          <div className="space-y-4 rounded-md border p-4">
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Cliente</p>
                <p className="font-medium">
                  {selectedCustomer?.fantasy_name ??
                    selectedCustomer?.business_name ??
                    "—"}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <p>Ventas elegibles</p>
                  <HelpTooltip label="Qué incluye ventas elegibles">
                    <p>
                      Es la suma de todas las ventas del cliente que cumplen
                      período, estado y autorización ARCA.
                    </p>
                  </HelpTooltip>
                </div>
                <p className="font-medium">
                  {formatCurrency(calculation.eligibleSalesTotal)}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <p>Objetivo</p>
                  <HelpTooltip label="Objetivo usado para validar">
                    <p>
                      Si las ventas elegibles igualan o superan este importe, el
                      cliente califica para la bonificación.
                    </p>
                  </HelpTooltip>
                </div>
                <p className="font-medium">
                  {formatCurrency(calculation.thresholdAmount)}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <p>NC calculada</p>
                  <HelpTooltip label="Importe calculado para la NC">
                    <p>
                      Este importe sale del beneficio configurado. No cambia al
                      desmarcar facturas.
                    </p>
                  </HelpTooltip>
                </div>
                <p className="font-medium">
                  {formatCurrency(calculation.creditAmount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Facturas asociadas</Label>
                <HelpTooltip label="Para qué sirven las facturas asociadas">
                  <p>
                    Las facturas seleccionadas respaldan la NC y se guardan como
                    comprobantes asociados.
                  </p>
                  <p>
                    El monto de la NC no puede superar el total de las facturas
                    seleccionadas.
                  </p>
                </HelpTooltip>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                {calculation.eligibleSales.length === 0 && (
                  <p className="p-2 text-muted-foreground text-sm">
                    No hay facturas ARCA autorizadas en el período.
                  </p>
                )}
                {calculation.eligibleSales.map((sale) => (
                  <div
                    className="flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                    key={sale.id}
                  >
                    <Checkbox
                      checked={selectedSaleIds.has(sale.id)}
                      id={`target-sale-${sale.id}`}
                      onCheckedChange={(checked) => {
                        setSelectedSaleIds((prev) => {
                          const next = new Set(prev);
                          if (checked) {
                            next.add(sale.id);
                          } else {
                            next.delete(sale.id);
                          }
                          return next;
                        });
                      }}
                    />
                    <Label
                      className="min-w-0 flex-1 cursor-pointer"
                      htmlFor={`target-sale-${sale.id}`}
                    >
                      <span className="block truncate font-medium">
                        {sale.invoiceNumber ?? `N°${sale.saleNumber ?? "—"}`}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {sale.saleDate ? formatDateOnly(sale.saleDate) : "—"} ·{" "}
                        {formatCurrency(sale.totalAmount)}
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="target-observations">Observaciones</Label>
              <textarea
                className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                id="target-observations"
                onChange={(event) => setObservations(event.target.value)}
                value={observations}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => {
              setOpen(false);
              reset();
            }}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <div className="flex items-center gap-1.5">
            <Button disabled={!canCreate} onClick={handleCreate} type="button">
              {isCreating ? "Generando..." : "Generar NC"}
            </Button>
            <HelpTooltip label="Qué pasa al generar la NC">
              <p>
                Crea la nota de crédito interna con origen Objetivo y genera
                saldo a favor del cliente.
              </p>
              <p>
                No la emite automáticamente en ARCA; eso se hace después desde
                el detalle de la NC.
              </p>
            </HelpTooltip>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
