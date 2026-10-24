"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveConfigAction } from "@/modules/commercial-ai/actions/commercial-ai.actions";
import { OPPORTUNITY_TYPES } from "@/modules/commercial-ai/constants";
import {
  type CommercialAiConfig,
  DEFAULT_COMMERCIAL_AI_CONFIG,
} from "@/modules/commercial-ai/types";
import { TypeBadge, useCommercialAi } from "./shared";

type NumberKey = {
  [K in keyof CommercialAiConfig]: CommercialAiConfig[K] extends number
    ? K
    : never;
}[keyof CommercialAiConfig];

type BooleanKey = {
  [K in keyof CommercialAiConfig]: CommercialAiConfig[K] extends boolean
    ? K
    : never;
}[keyof CommercialAiConfig];

export function SettingsTab() {
  const { snapshot } = useCommercialAi();
  const [config, setConfig] = useState<CommercialAiConfig>(snapshot.config);
  const [pending, startTransition] = useTransition();

  const setNumber = (key: NumberKey, value: string) =>
    setConfig((prev) => ({ ...prev, [key]: Number(value) || 0 }));
  const setBoolean = (key: BooleanKey, value: boolean) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const save = () =>
    startTransition(async () => {
      const result = await saveConfigAction(snapshot.orgSlug, config);
      if (result.success) {
        toast.success(
          "Listo. Volvimos a analizar la cartera con estos valores."
        );
      } else {
        toast.error(result.error);
      }
    });

  const num = (key: NumberKey, label: string) => (
    <Input
      aria-label={label}
      className="w-20 text-right tabular-nums"
      inputMode="numeric"
      onChange={(e) => setNumber(key, e.target.value)}
      type="number"
      value={config[key]}
    />
  );

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Estas reglas deciden qué clientes aparecen como oportunidad. Aplican a
        todo el equipo. No usan IA: son cálculos sobre las ventas de Rhinos.
      </p>

      <RuleCard
        description="Clientes que venían comprando seguido y bajaron frecuencia o monto."
        enabled={config.riesgoOn}
        onToggle={(v) => setBoolean("riesgoOn", v)}
        type="riesgo"
      >
        <Field>
          Caída de {num("riesgoCaida", "Caída en %")} % o más en frecuencia o
          monto
        </Field>
        <Field>
          Comparando los últimos {num("riesgoRec", "Días recientes")} días
          contra los {num("riesgoBase", "Días base")} días anteriores
        </Field>
        <Field>
          Con al menos {num("riesgoMin", "Pedidos mínimos")} pedidos en el
          período base
        </Field>
      </RuleCard>

      <RuleCard
        description="Clientes que dejaron de comprar."
        enabled={config.dormOn}
        onToggle={(v) => setBoolean("dormOn", v)}
        type="reactivar"
      >
        <Field>
          {num("dormDias", "Días sin comprar")} días o más sin comprar
        </Field>
        <Field>
          Y al menos {num("dormMin", "Pedidos históricos")} pedidos en el
          historial
        </Field>
      </RuleCard>

      <RuleCard
        description="Productos de una categoría que el cliente ya compra, que sus pares llevan y él nunca pidió."
        enabled={config.faltOn}
        onToggle={(v) => setBoolean("faltOn", v)}
        type="faltante"
      >
        <Field>
          Lo compra el {num("faltPct", "Porcentaje de pares")} % o más de sus
          pares
        </Field>
      </RuleCard>

      <RuleCard
        description="Categorías enteras que el cliente no compra y sus pares sí."
        enabled={config.crossOn}
        onToggle={(v) => setBoolean("crossOn", v)}
        type="cross"
      >
        <Field>
          La compra el {num("crossPct", "Porcentaje de pares")} % o más de sus
          pares
        </Field>
        <Field>
          Solo clientes con {num("crossAnt", "Antigüedad mínima")} días o más de
          antigüedad
        </Field>
      </RuleCard>

      <Card className="gap-2 p-4">
        <h3 className="font-semibold">General</h3>
        <Field>
          Comparar compras de los últimos {num("ventana", "Ventana en días")}{" "}
          días
        </Field>
        <Field>
          Mirar {num("historia", "Historia en días")} días de historia para
          saber si algo ya se compró
        </Field>
        <Field>
          Comparar con clientes del mismo canal si hay al menos{" "}
          {num("minPares", "Pares mínimos")}; si no, con toda la cartera
        </Field>
        <Field>
          Hasta {num("maxOpps", "Máximo por cliente")} oportunidades por cliente
        </Field>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => setConfig(DEFAULT_COMMERCIAL_AI_CONFIG)}
          variant="ghost"
        >
          Volver a los valores sugeridos
        </Button>
        <Button disabled={pending} onClick={save}>
          Guardar y volver a analizar
        </Button>
      </div>
    </div>
  );
}

function RuleCard({
  type,
  description,
  enabled,
  onToggle,
  children,
}: {
  type: "riesgo" | "reactivar" | "faltante" | "cross";
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <TypeBadge type={type} />
        <p className="flex-1 text-muted-foreground text-sm">{description}</p>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span>{enabled ? "Activa" : "Apagada"}</span>
          <Switch
            aria-label={`Regla ${OPPORTUNITY_TYPES[type].label}`}
            checked={enabled}
            onCheckedChange={onToggle}
          />
        </div>
      </div>
      <div
        className={
          enabled ? "space-y-1" : "pointer-events-none space-y-1 opacity-50"
        }
      >
        {children}
      </div>
    </Card>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">{children}</div>
  );
}
