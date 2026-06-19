"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";
import { AsientoModal } from "@/components/accounting/asiento-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AnyEvento } from "@/modules/accounting/types";

// ← Reemplazá por el orgId real (el mismo que pusiste en 007_seed_cuentas_reglas.sql)
const ORG_ID = "e5ac263f-0399-4b9e-bfed-e9ac06616410";

const FLUJO_ANTICIPO_STEP_RE = /FLUJO-ANTICIPO-STEP(\d)/;

const CLIENTE_ID = "22222222-2222-2222-2222-222222222222";
const PROVEEDOR_ID = "55555555-5555-5555-5555-555555555555";
const FECHA = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------
// Casos individuales (variados para smoke-test del motor)
// ------------------------------------------------------------
const EJEMPLOS: Array<{ label: string; payload: AnyEvento }> = [
  {
    label: "Factura venta MANUAL",
    payload: {
      orgId: ORG_ID,
      referenciaId: "11111111-1111-1111-1111-111111111111",
      referenciaTabla: "sales_orders",
      fecha: FECHA,
      descripcion: "Factura A-0001-00000001",
      idempotencyKey: "",
      tipoEvento: "FACTURA_VENTA",
      datos: {
        tipoFactura: "MANUAL",
        totalFactura: "1210.0000",
        condicionVenta: "CONTADO",
        clienteId: CLIENTE_ID,
        facturaNumero: "A-0001-00000001",
        lineasDesglosadas: [
          {
            accountCode: "VENTAS_CALZADO",
            montoNeto: "1000.0000",
            montoImpuestos: "210.0000",
          },
        ],
      },
    },
  },
  {
    label: "Cobro (línea bancaria seleccionable)",
    payload: {
      orgId: ORG_ID,
      referenciaId: "33333333-3333-3333-3333-333333333333",
      referenciaTabla: "receivable_payments",
      fecha: FECHA,
      descripcion: "Cobro factura A-0001",
      idempotencyKey: "",
      tipoEvento: "COBRO",
      datos: {
        montoCobrado: "1210.0000",
        metodoPago: "TRANSFERENCIA",
        clienteId: CLIENTE_ID,
      },
    },
  },
  {
    label: "Factura compra (cuenta neta seleccionable)",
    payload: {
      orgId: ORG_ID,
      referenciaId: "44444444-4444-4444-4444-444444444444",
      referenciaTabla: "purchase_orders",
      fecha: FECHA,
      descripcion: "Factura proveedor B-0001",
      idempotencyKey: "",
      tipoEvento: "FACTURA_COMPRA",
      datos: {
        montoNeto: "800.0000",
        montoImpuestos: "168.0000",
        totalFactura: "968.0000",
        condicionCompra: "CREDITO",
        proveedorId: PROVEEDOR_ID,
        facturaNumero: "B-0001-00000001",
      },
    },
  },
];

// ------------------------------------------------------------
// Flujo anticipo: 3 pasos con referencias cruzadas
// Escenario: venta total $1210 (neto $1000 + IVA $210)
//   Paso 1 — Factura anticipo 50%: $605
//   Paso 2 — NC revierte el anticipo
//   Paso 3 — Factura contra remito 100%
// ------------------------------------------------------------

// ID fijo para la venta original (referencia cruzada entre los 3 pasos)
const SALE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const FLUJO_ANTICIPO: Array<{
  step: number;
  label: string;
  badge: string;
  description: string;
  payload: AnyEvento;
}> = [
  {
    step: 1,
    label: "Factura anticipo 50%",
    badge: "FACTURA_VENTA",
    description:
      "El cliente paga $605 como adelanto. Se debita ANTICIPO_CLIENTES y se acredita el deudor.",
    payload: {
      orgId: ORG_ID,
      referenciaId: SALE_ID,
      referenciaTabla: "sales_orders",
      fecha: FECHA,
      descripcion: "Anticipo 50% — A-0002-00000001",
      idempotencyKey: "",
      tipoEvento: "FACTURA_VENTA",
      datos: {
        tipoFactura: "ANTICIPO",
        totalFactura: "605.0000",
        montoNeto: "500.0000",
        montoImpuestos: "105.0000",
        condicionVenta: "CREDITO",
        clienteId: CLIENTE_ID,
        facturaNumero: "A-0002-00000001",
      },
    },
  },
  {
    step: 2,
    label: "NC — revierte el anticipo",
    badge: "NC_VENTA",
    description:
      "Al entregar el remito, se anula el anticipo con una nota de crédito. Lados invertidos respecto al paso 1.",
    payload: {
      orgId: ORG_ID,
      referenciaId: `${SALE_ID.slice(0, -1)}b`,
      referenciaTabla: "sales_returns",
      fecha: FECHA,
      descripcion: "NC anticipo — revierte A-0002-00000001",
      idempotencyKey: "",
      tipoEvento: "NC_VENTA",
      datos: {
        tipoFactura: "ANTICIPO",
        totalFactura: "605.0000",
        montoNeto: "500.0000",
        montoImpuestos: "105.0000",
        clienteId: CLIENTE_ID,
        ventaId: SALE_ID,
      },
    },
  },
  {
    step: 3,
    label: "Factura remito 100%",
    badge: "FACTURA_VENTA",
    description:
      "Factura final por el total de la venta. Los ítems tienen account_code asignado desde el catálogo.",
    payload: {
      orgId: ORG_ID,
      referenciaId: SALE_ID,
      referenciaTabla: "sales_orders",
      fecha: FECHA,
      descripcion: "Remito — A-0003-00000001",
      idempotencyKey: "",
      tipoEvento: "FACTURA_VENTA",
      datos: {
        tipoFactura: "REMITO",
        totalFactura: "1210.0000",
        condicionVenta: "CONTADO",
        clienteId: CLIENTE_ID,
        facturaNumero: "A-0003-00000001",
        lineasDesglosadas: [
          {
            accountCode: "VENTAS_CALZADO",
            montoNeto: "1000.0000",
            montoImpuestos: "210.0000",
          },
        ],
      },
    },
  },
];

// ------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------

export default function TestAsientoModal() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<AnyEvento | null>(null);
  const [lastResult, setLastResult] = useState<{
    key: string;
    asientoId: string;
  } | null>(null);
  // Rastrear qué pasos del flujo fueron confirmados
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  function openModal(payload: AnyEvento, stepKey?: string) {
    const fresh = {
      ...payload,
      idempotencyKey: stepKey
        ? `${stepKey}-${Date.now()}`
        : `${payload.tipoEvento}-${Date.now()}`,
    } as AnyEvento;
    setActive(fresh);
    setOpen(true);
  }

  function handleConfirm(asientoId: string, stepNum?: number) {
    setOpen(false);
    setLastResult({ key: active?.idempotencyKey ?? "", asientoId });
    if (stepNum !== undefined) {
      setCompletedSteps((prev) => new Set([...prev, stepNum]));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10 p-8">
      <div>
        <h1 className="mb-1 font-bold text-2xl">Test — AsientoModal</h1>
        <p className="text-muted-foreground text-sm">
          Página temporal para validar el modal de confirmación de asientos
          contra el servicio contable. Cada apertura genera una{" "}
          <code className="font-mono">idempotencyKey</code> única.
        </p>
      </div>

      {lastResult && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700 text-sm">
          ✓ Asiento creado:{" "}
          <code className="font-mono text-xs">{lastResult.asientoId}</code>
        </div>
      )}

      {/* ── Flujo anticipo ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Flujo anticipo completo</h2>
          {completedSteps.size > 0 && (
            <Button
              className="text-muted-foreground text-xs"
              onClick={() => setCompletedSteps(new Set())}
              size="sm"
              variant="ghost"
            >
              Reiniciar estado
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Venta total $1.210 (neto $1.000 + IVA $210). El cliente abona 50% como
          anticipo, luego se entrega el remito.
        </p>

        <div className="space-y-3">
          {FLUJO_ANTICIPO.map(
            ({ step, label, badge, description, payload }) => {
              const done = completedSteps.has(step);
              return (
                <div className="flex gap-4" key={step}>
                  {/* Indicador de paso */}
                  <div className="flex flex-col items-center gap-1 pt-1">
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                    {step < FLUJO_ANTICIPO.length && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>

                  {/* Card del paso */}
                  <Card
                    className={`mb-3 flex-1 ${done ? "border-green-200 bg-green-50/40" : ""}`}
                  >
                    <CardHeader className="pt-3 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground text-xs">
                          Paso {step}
                        </span>
                        <Badge className="font-mono text-xs" variant="outline">
                          {badge}
                        </Badge>
                        {done && (
                          <Badge className="bg-green-100 text-green-700 text-xs hover:bg-green-100">
                            confirmado
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-sm">{label}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pb-4">
                      <p className="text-muted-foreground text-xs">
                        {description}
                      </p>
                      <Button
                        onClick={() =>
                          openModal(payload, `FLUJO-ANTICIPO-STEP${step}`)
                        }
                        size="sm"
                        variant={done ? "outline" : "default"}
                      >
                        {done ? "Re-abrir modal" : "Abrir modal"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              );
            }
          )}
        </div>
      </section>

      <Separator />

      {/* ── Casos individuales ── */}
      <section className="space-y-4">
        <h2 className="font-semibold">Otros casos</h2>
        <div className="grid gap-3">
          {EJEMPLOS.map((e) => (
            <Card key={e.label}>
              <CardHeader className="pt-4 pb-2">
                <CardTitle className="font-medium text-sm">{e.label}</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <Button onClick={() => openModal(e.payload)} size="sm">
                  Abrir modal
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {active && (
        <AsientoModal
          eventoPayload={active}
          mode="gate"
          onCancel={() => setOpen(false)}
          onConfirm={(asientoId) => {
            // Detectar si viene del flujo anticipo por el prefijo de la key
            const stepMatch = active.idempotencyKey.match(
              FLUJO_ANTICIPO_STEP_RE
            );
            const stepNum = stepMatch ? Number(stepMatch[1]) : undefined;
            handleConfirm(asientoId, stepNum);
          }}
          open={open}
        />
      )}
    </div>
  );
}
