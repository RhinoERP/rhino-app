"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  KPI_FIELDS,
  type KpiField,
  type KpiValues,
} from "@/modules/seller-progress/progress";
import { saveProgressGoalAction } from "@/modules/seller-progress/progress.actions";
import type {
  SellerProgressRow,
  SellerProgressSnapshot,
} from "@/modules/seller-progress/progress.service";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const COUNT_FIELDS = new Set<KpiField>([
  "units",
  "boxes",
  "newCustomers",
  "visits",
  "sales",
]);
const QUANTITIES = [
  { key: "units", label: "Unidades sueltas" },
  { key: "kg", label: "Kilogramos" },
  { key: "lt", label: "Litros" },
  { key: "boxes", label: "Bultos (cajas)" },
  { key: "meters", label: "Metros" },
] as const;

function display(key: KpiField, value: number): string {
  return key === "billing" ? money.format(value) : number.format(value);
}

function KpiCard({
  title,
  field,
  actual,
  targets,
  editable,
  onChange,
}: {
  title: string;
  field: KpiField;
  actual: KpiValues;
  targets: KpiValues;
  editable: boolean;
  onChange: (key: KpiField, value: number) => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-muted-foreground text-sm">{title}</h3>
      <strong className="text-xl">{display(field, actual[field])}</strong>
      {editable ? (
        <label className="mt-2 block text-sm">
          Meta {field === "billing" ? "(ARS)" : ""}
          <input
            className="mt-1 w-full rounded-md border bg-background p-2"
            inputMode={COUNT_FIELDS.has(field) ? "numeric" : "decimal"}
            min="0"
            onChange={(event) => onChange(field, Number(event.target.value))}
            step={COUNT_FIELDS.has(field) ? "1" : "0.01"}
            type="number"
            value={targets[field]}
          />
        </label>
      ) : (
        <p className="mt-1 text-muted-foreground text-sm">
          {targets[field]
            ? `Meta: ${display(field, targets[field])}`
            : "Sin meta"}
        </p>
      )}
    </div>
  );
}

function SellerCard({
  row,
  snapshot,
  orgSlug,
}: {
  row: SellerProgressRow;
  snapshot: SellerProgressSnapshot;
  orgSlug: string;
}) {
  const [targets, setTargets] = useState<KpiValues>(row.targets);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const editable = snapshot.isAdmin && snapshot.goalsAvailable;
  const onChange = (key: KpiField, value: number) =>
    setTargets((current) => ({ ...current, [key]: value }));
  const percentage = targets.billing
    ? Math.round((row.actual.billing / targets.billing) * 100)
    : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{row.sellerName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-2xl">
              {money.format(row.actual.billing)}
            </strong>
            <span className="text-muted-foreground text-sm">
              {targets.billing
                ? `${percentage}% de ${money.format(targets.billing)} facturados`
                : "Sin meta de facturación"}
            </span>
          </div>
          <div
            aria-label={`${percentage}% de la meta de facturación`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.max(0, Math.min(100, percentage))}
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard
            actual={row.actual}
            editable={editable}
            field="billing"
            onChange={onChange}
            targets={targets}
            title="Facturación ($)"
          />
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 font-semibold">Cantidad vendida</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {QUANTITIES.filter(
                (unit) =>
                  unit.key !== "meters" ||
                  row.actual.meters > 0 ||
                  targets.meters > 0
              ).map(({ key, label }) => (
                <KpiCard
                  actual={row.actual}
                  editable={editable}
                  field={key}
                  key={key}
                  onChange={onChange}
                  targets={targets}
                  title={label}
                />
              ))}
            </div>
          </div>
          <KpiCard
            actual={row.actual}
            editable={editable}
            field="newCustomers"
            onChange={onChange}
            targets={targets}
            title="Clientes nuevos"
          />
          <KpiCard
            actual={row.actual}
            editable={editable}
            field="visits"
            onChange={onChange}
            targets={targets}
            title="Visitas realizadas"
          />
          <KpiCard
            actual={row.actual}
            editable={editable}
            field="sales"
            onChange={onChange}
            targets={targets}
            title="Cantidad de ventas"
          />
        </div>
        {editable && (
          <div>
            <Button
              disabled={pending}
              onClick={() => {
                setMessage("");
                startTransition(async () => {
                  const result = await saveProgressGoalAction({
                    orgSlug,
                    sellerId: row.sellerId,
                    month: snapshot.month,
                    targets,
                  });
                  setMessage(
                    result.ok
                      ? "Objetivos guardados."
                      : (result.error ?? "No se pudieron guardar.")
                  );
                });
              }}
              type="button"
            >
              {pending ? "Guardando…" : "Guardar objetivos"}
            </Button>
            {message && (
              <p aria-live="polite" className="mt-2 text-sm">
                {message}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProgressPage({
  snapshot,
  orgSlug,
}: {
  snapshot: SellerProgressSnapshot;
  orgSlug: string;
}) {
  const label = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${snapshot.month}T12:00:00Z`));
  const next = new Date(`${snapshot.currentMonth}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const team = snapshot.rows.reduce(
    (totals, row) => {
      for (const key of KPI_FIELDS) {
        totals.actual[key] += row.actual[key];
        totals.targets[key] += row.targets[key];
      }
      return totals;
    },
    {
      actual: Object.fromEntries(
        KPI_FIELDS.map((key) => [key, 0])
      ) as KpiValues,
      targets: Object.fromEntries(
        KPI_FIELDS.map((key) => [key, 0])
      ) as KpiValues,
    }
  );
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-2 pb-8">
      <header>
        <h1 className="font-bold text-2xl">
          {snapshot.isAdmin ? "Progreso del equipo" : "Mi progreso"}
        </h1>
        <p className="text-muted-foreground">
          {label} · Facturas emitidas, ventas confirmadas y visitas con
          check-in. Las cantidades se muestran separadas por unidad de medida.
        </p>
        <p className="text-muted-foreground text-sm">
          Disponible con conexión. La actividad de la PWA aparece al
          sincronizarse.
        </p>
        <nav aria-label="Mes del progreso" className="mt-3 flex gap-4 text-sm">
          <Link
            className="text-primary underline"
            href={`/org/${orgSlug}/mi-progreso`}
          >
            Mes actual
          </Link>
          <Link
            className="text-primary underline"
            href={`/org/${orgSlug}/mi-progreso?mes=${nextMonth}`}
          >
            Mes siguiente
          </Link>
        </nav>
      </header>
      {!snapshot.goalsAvailable && (
        <output className="block rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          {snapshot.isAdmin
            ? "El avance se puede consultar, pero para asignar objetivos hay que aplicar las migraciones de progreso 20261127160000 y 20261127170000 en este entorno."
            : "El avance está disponible; los objetivos aún no están habilitados."}
        </output>
      )}
      {snapshot.isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Objetivos del equipo · {label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Facturación: <strong>{money.format(team.actual.billing)}</strong>{" "}
              / meta {money.format(team.targets.billing)}
            </p>
            <p>
              Clientes nuevos:{" "}
              <strong>{number.format(team.actual.newCustomers)}</strong> / meta{" "}
              {number.format(team.targets.newCustomers)} · Visitas:{" "}
              <strong>{number.format(team.actual.visits)}</strong> / meta{" "}
              {number.format(team.targets.visits)} · Ventas:{" "}
              <strong>{number.format(team.actual.sales)}</strong> / meta{" "}
              {number.format(team.targets.sales)}
            </p>
            <p>
              Cantidad vendida:{" "}
              {QUANTITIES.map(({ key, label: unitLabel }) => (
                <span className="mr-3 inline-block" key={key}>
                  {unitLabel}:{" "}
                  <strong>{number.format(team.actual[key])}</strong> /{" "}
                  {number.format(team.targets[key])}
                </span>
              ))}
            </p>
            <p className="text-muted-foreground">
              Asigná y guardá las metas individuales debajo. Las metas del
              equipo son su suma.
            </p>
          </CardContent>
        </Card>
      )}
      {snapshot.rows.length === 0 && <p>No hay vendedores activos.</p>}
      {snapshot.rows.map((row) => (
        <SellerCard
          key={`${snapshot.month}:${row.sellerId}`}
          orgSlug={orgSlug}
          row={row}
          snapshot={snapshot}
        />
      ))}
    </main>
  );
}
