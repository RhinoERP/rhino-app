"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveGoalsAction } from "@/modules/commercial-ai/actions/commercial-ai.actions";
import { LEVERS } from "@/modules/commercial-ai/constants";
import {
  formatMoney,
  formatMoneyShort,
} from "@/modules/commercial-ai/engine/analysis";
import type { LeverKey } from "@/modules/commercial-ai/types";
import { PlanCard, SectionCard, SellerChip, useCommercialAi } from "./shared";

type LeverValues = Record<LeverKey, number>;

const EMPTY: LeverValues = { base: 0, rec: 0, vm: 0, nue: 0 };

function nextMonth(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  const date = new Date(Date.UTC(y, m, 1));
  return date.toISOString().slice(0, 10);
}

function monthLabel(periodMonth: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${periodMonth}T12:00:00Z`));
}

const total = (values: LeverValues) =>
  values.base + values.rec + values.vm + values.nue;

export function GoalsTab() {
  const { snapshot, isManager } = useCommercialAi();
  const { plan } = snapshot;
  const current = plan.periodMonth;
  const following = nextMonth(current);
  const [period, setPeriod] = useState(current);
  const [pending, startTransition] = useTransition();

  const sellerKeys = useMemo(() => {
    const keys = new Set<string>(snapshot.sellers.map((s) => s.id));
    for (const seller of plan.sellers) {
      if (seller.sellerId !== "sin-asignar") {
        keys.add(seller.sellerId);
      }
    }
    return [...keys];
  }, [snapshot.sellers, plan.sellers]);

  const initialValues = (target: string): Record<string, LeverValues> => {
    const result: Record<string, LeverValues> = {};
    for (const key of sellerKeys) {
      const existing = plan.sellers.find((s) => s.sellerId === key);
      const hasCurrentGoal =
        target === current && existing && existing.target > 0;
      result[key] = hasCurrentGoal
        ? {
            base: existing.levers.base.plan,
            rec: existing.levers.rec.plan,
            vm: existing.levers.vm.plan,
            nue: existing.levers.nue.plan,
          }
        : { ...EMPTY, ...(plan.suggestedNext[key] ?? {}) };
    }
    return result;
  };

  const [values, setValues] = useState(() => initialValues(current));

  const changePeriod = (value: string) => {
    setPeriod(value);
    setValues(initialValues(value));
  };

  const update = (sellerId: string, lever: LeverKey, raw: string) => {
    const amount = Math.max(0, Number(raw.replace(/\D/g, "")) || 0);
    setValues((prev) => ({
      ...prev,
      [sellerId]: { ...(prev[sellerId] ?? EMPTY), [lever]: amount },
    }));
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveGoalsAction(snapshot.orgSlug, {
        periodMonth: period,
        goals: sellerKeys.map((sellerId) => ({
          sellerId,
          levers: values[sellerId] ?? EMPTY,
        })),
      });
      if (result.success) {
        toast.success(`Plan de ${monthLabel(period)} guardado.`);
      } else {
        toast.error(result.error);
      }
    });

  const teamTotals = LEVERS.reduce(
    (acc, lever) => {
      acc[lever.key] = sellerKeys.reduce(
        (sum, key) => sum + (values[key]?.[lever.key] ?? 0),
        0
      );
      return acc;
    },
    { ...EMPTY }
  );

  return (
    <div className="space-y-5">
      <PlanCard
        dayOfMonth={plan.dayOfMonth}
        daysInMonth={plan.daysInMonth}
        levers={plan.team.levers}
        real={plan.team.real}
        subject="el equipo cierra"
        target={plan.team.target}
        title={`Equipo · ${monthLabel(current)}`}
      />

      <SectionCard title="Avance por vendedor">
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                {LEVERS.map((lever) => (
                  <TableHead
                    className="text-right"
                    key={lever.key}
                    title={lever.help}
                  >
                    {lever.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.sellers.map((seller) => (
                <TableRow key={seller.sellerId}>
                  <TableCell>
                    <SellerChip
                      sellerId={
                        seller.sellerId === "sin-asignar"
                          ? null
                          : seller.sellerId
                      }
                    />
                  </TableCell>
                  {LEVERS.map((lever) => {
                    const value = seller.levers[lever.key];
                    return (
                      <TableCell
                        className="text-right tabular-nums"
                        key={lever.key}
                      >
                        {formatMoneyShort(value.real)}
                        {value.plan ? (
                          <span className="text-muted-foreground">
                            {" "}
                            / {formatMoneyShort(value.plan)}
                          </span>
                        ) : null}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoneyShort(seller.real)}
                    {seller.target ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        / {formatMoneyShort(seller.target)}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {isManager ? (
        <SectionCard
          description="Arrancamos con una sugerencia calculada desde la cartera: promedio de los últimos 3 meses + parte de las oportunidades detectadas. Ajustala como quieras."
          right={
            <Select onValueChange={changePeriod} value={period}>
              <SelectTrigger aria-label="Período" className="w-44 capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="capitalize" value={current}>
                  {monthLabel(current)}
                </SelectItem>
                <SelectItem className="capitalize" value={following}>
                  {monthLabel(following)}
                </SelectItem>
              </SelectContent>
            </Select>
          }
          title="Armar plan"
        >
          {sellerKeys.length ? (
            <>
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      {LEVERS.map((lever) => (
                        <TableHead key={lever.key} title={lever.help}>
                          {lever.label}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Meta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellerKeys.map((sellerId) => (
                      <TableRow key={sellerId}>
                        <TableCell>
                          <SellerChip sellerId={sellerId} />
                        </TableCell>
                        {LEVERS.map((lever) => (
                          <TableCell key={lever.key}>
                            <Input
                              aria-label={`${lever.label} de ${snapshot.sellers.find((s) => s.id === sellerId)?.name ?? "vendedor"}`}
                              className="w-32 text-right tabular-nums"
                              inputMode="numeric"
                              onChange={(e) =>
                                update(sellerId, lever.key, e.target.value)
                              }
                              value={(
                                values[sellerId]?.[lever.key] ?? 0
                              ).toLocaleString("es-AR")}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatMoney(total(values[sellerId] ?? EMPTY))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>Equipo</TableCell>
                      {LEVERS.map((lever) => (
                        <TableCell className="tabular-nums" key={lever.key}>
                          {formatMoneyShort(teamTotals[lever.key])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(total(teamTotals))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              <div className="flex justify-end border-t p-4">
                <Button disabled={pending} onClick={save}>
                  Guardar plan de {monthLabel(period)}
                </Button>
              </div>
            </>
          ) : (
            <p className="border-t px-4 py-4 text-muted-foreground text-sm">
              No hay vendedores. Asigná el rol Vendedor a tu equipo en
              Configuración → Miembros, o asigná vendedores a los clientes.
            </p>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
