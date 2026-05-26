"use client";

import {
  ArrowRightIcon,
  BookOpenIcon,
  BuildingsIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  GlobeIcon,
  InfoIcon,
  LightbulbIcon,
  LinkBreakIcon,
  ListChecksIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  ToggleRightIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-sm">
      {n}
    </span>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <LightbulbIcon
        className="mt-0.5 size-4 shrink-0 text-amber-500"
        weight="fill"
      />
      <p className="text-amber-800 text-sm dark:text-amber-300">{children}</p>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
      <InfoIcon
        className="mt-0.5 size-4 shrink-0 text-blue-500"
        weight="fill"
      />
      <p className="text-blue-800 text-sm dark:text-blue-300">{children}</p>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3">
      <WarningIcon
        className="mt-0.5 size-4 shrink-0 text-rose-500"
        weight="fill"
      />
      <p className="text-rose-800 text-sm dark:text-rose-300">{children}</p>
    </div>
  );
}

function ExampleBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge className="rounded-md border-emerald-500/20 bg-emerald-500/10 font-mono text-emerald-700 text-xs dark:text-emerald-400">
      {children}
    </Badge>
  );
}

type SectionCardProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

function SectionCard({
  icon,
  title,
  subtitle,
  color,
  children,
  defaultOpen = false,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <button
          className={`flex w-full items-center justify-between gap-4 rounded-xl border px-5 py-4 text-left transition-colors hover:bg-muted/30 ${color}`}
          type="button"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{icon}</span>
            <div>
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-muted-foreground text-xs">{subtitle}</p>
            </div>
          </div>
          {open ? (
            <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-xl border bg-card p-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Province example table
// ─────────────────────────────────────────────────────────────────────────────

const PROVINCE_EXAMPLES = [
  {
    province: "Santa Fe",
    iibb: "IIBB Santa Fe 3.5%",
    percepcion: "Percepción IIBB Santa Fe 3%",
    sellos: "Sellos Santa Fe 1.2%",
  },
  {
    province: "CABA",
    iibb: "IIBB CABA 3%",
    percepcion: "Percepción IIBB CABA 2.5%",
    sellos: "Sellos CABA 1%",
  },
  {
    province: "Buenos Aires",
    iibb: "IIBB Buenos Aires (ARBA) 3.5%",
    percepcion: "Percepción IIBB Buenos Aires (ARBA) 3%",
    sellos: "Sellos Buenos Aires (ARBA) 1.2%",
  },
  {
    province: "Córdoba",
    iibb: "IIBB Córdoba 4%",
    percepcion: "Percepción IIBB Córdoba 3%",
    sellos: "Sellos Córdoba 1.2%",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function TaxesHelpSection() {
  const [mainOpen, setMainOpen] = useState(false);

  return (
    <div className="rounded-xl border border-dashed">
      {/* Toggle header */}
      <button
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        onClick={() => setMainOpen((v) => !v)}
        type="button"
      >
        <div className="flex items-center gap-3">
          <BookOpenIcon
            className="size-5 text-muted-foreground"
            weight="duotone"
          />
          <div>
            <p className="font-medium text-sm">Guía de impuestos</p>
            <p className="text-muted-foreground text-xs">
              Cómo configurar impuestos, IIBB, percepciones, retenciones y más
            </p>
          </div>
        </div>
        <Badge className="shrink-0 text-xs" variant="outline">
          {mainOpen ? "Cerrar guía" : "Ver guía completa"}
        </Badge>
      </button>

      {mainOpen && (
        <div className="border-t px-5 pt-5 pb-6">
          {/* Overview strip */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: (
                  <GlobeIcon
                    className="size-5 text-blue-500"
                    weight="duotone"
                  />
                ),
                title: "Importar catálogo",
                desc: "150+ impuestos argentinos precargados. Elegís los que aplican a tu actividad y provincia.",
              },
              {
                icon: (
                  <ToggleRightIcon
                    className="size-5 text-purple-500"
                    weight="duotone"
                  />
                ),
                title: "Asignar a módulos",
                desc: "Cada impuesto puede activarse en Ventas, Venta Directa, Notas de Crédito o Débito.",
              },
              {
                icon: (
                  <ShieldCheckIcon
                    className="size-5 text-emerald-500"
                    weight="duotone"
                  />
                ),
                title: "Conectado a ARCA",
                desc: "Cada impuesto tiene su código AFIP. Al facturar, se envía automáticamente a ARCA.",
              },
            ].map((item) => (
              <div
                className="flex gap-3 rounded-lg border bg-muted/20 p-4"
                key={item.title}
              >
                {item.icon}
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {/* ── PASO 1: Importar catálogo ─────────────────── */}
            <SectionCard
              color="border-blue-500/20 bg-blue-500/5"
              defaultOpen
              icon={<GlobeIcon weight="duotone" />}
              subtitle="¿Qué impuestos elijo y cómo los importo?"
              title="Paso 1 — Importar el catálogo de impuestos argentinos"
            >
              <div className="space-y-5">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  En lugar de crear cada impuesto a mano con la alícuota y el
                  código ARCA correcto, podés importarlos desde nuestro catálogo
                  preconfigurado. Incluye IVA, IIBB, percepciones, retenciones y
                  sellos de las 24 provincias.
                </p>

                {/* Steps */}
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <StepNumber n={1} />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        Hacé clic en &ldquo;Importar catálogo argentino&rdquo;
                      </p>
                      <p className="text-muted-foreground text-xs">
                        El botón está arriba a la derecha, al lado de
                        &ldquo;Nuevo Impuesto&rdquo;.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <StepNumber n={2} />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        Filtrá por tu provincia
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Usá el dropdown del modal para ver solo los impuestos de
                        tu provincia. También podés buscar por nombre.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <StepNumber n={3} />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        Seleccioná los que aplican a tu organización
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Marcá con el checkbox cada impuesto. Podés seleccionar
                        varios a la vez. Los que ya importaste aparecen como
                        &ldquo;Ya importado&rdquo; y no se duplican.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <StepNumber n={4} />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        Hacé clic en &ldquo;Importar&rdquo;
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Los impuestos aparecen en tu tabla en segundos, ya con
                        el código ARCA correcto asignado.
                      </p>
                    </div>
                  </div>
                </div>

                <Tip>
                  <strong>¿Primera vez?</strong> Empezá importando solo los
                  impuestos de tu provincia principal más los nacionales (IVA y
                  retenciones AFIP). Siempre podés volver a importar más
                  después.
                </Tip>

                {/* Province example table */}
                <div>
                  <p className="mb-3 font-medium text-sm">
                    Ejemplo — ¿cuáles importar según tu provincia?
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-2.5 text-left font-medium text-xs">
                            Provincia
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-xs">
                            IIBB
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-xs">
                            Percepción
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-xs">
                            Sellos
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {PROVINCE_EXAMPLES.map((row, i) => (
                          <tr
                            className={
                              i % 2 === 0 ? "bg-background" : "bg-muted/10"
                            }
                            key={row.province}
                          >
                            <td className="px-4 py-2.5 font-medium text-xs">
                              {row.province}
                            </td>
                            <td className="px-4 py-2.5">
                              <ExampleBadge>{row.iibb}</ExampleBadge>
                            </td>
                            <td className="px-4 py-2.5">
                              <ExampleBadge>{row.percepcion}</ExampleBadge>
                            </td>
                            <td className="px-4 py-2.5">
                              <ExampleBadge>{row.sellos}</ExampleBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-muted-foreground text-xs">
                    + IVA 21% y retenciones AFIP aplican para todas las
                    provincias.
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* ── PASO 2: Asignación por módulo ─────────────── */}
            <SectionCard
              color="border-purple-500/20 bg-purple-500/5"
              icon={<ToggleRightIcon weight="duotone" />}
              subtitle="¿Qué impuesto va en cada tipo de documento?"
              title="Paso 2 — Asignar impuestos a módulos"
            >
              <div className="space-y-5">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Una vez importados, cada impuesto puede asignarse a uno o
                  varios módulos. Cuando creás una venta (o NC o ND), el sistema
                  preselecciona automáticamente los impuestos que asignaste a
                  ese módulo, evitando que tengas que agregarlos uno por uno
                  cada vez.
                </p>

                {/* Module cards */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      title: "Ventas",
                      color: "border-blue-500/20 bg-blue-500/5",
                      dot: "bg-blue-500",
                      desc: "Aplica a las ventas de presupuesto (Factura A, B, C). Acá va el IVA y el IIBB de tu provincia si sos agente de percepción.",
                      examples: ["IVA 21%", "IIBB Santa Fe 3.5%"],
                    },
                    {
                      title: "Venta Directa / POS",
                      color: "border-purple-500/20 bg-purple-500/5",
                      dot: "bg-purple-500",
                      desc: "Ventas en el punto de venta directo. Generalmente los mismos impuestos que Ventas.",
                      examples: ["IVA 21%", "Percepción IIBB CABA 2.5%"],
                    },
                    {
                      title: "Notas de Crédito",
                      color: "border-emerald-500/20 bg-emerald-500/5",
                      dot: "bg-emerald-500",
                      desc: "Aplica al reversar una venta. Los tributos de la NC deben coincidir con los de la factura original.",
                      examples: ["IVA 21%", "IIBB Santa Fe 3.5%"],
                    },
                    {
                      title: "Notas de Débito",
                      color: "border-amber-500/20 bg-amber-500/5",
                      dot: "bg-amber-500",
                      desc: "Para cobros adicionales (ajustes de precio, diferencias de cambio, etc.).",
                      examples: ["IVA 21%"],
                    },
                  ].map((mod) => (
                    <div
                      className={`rounded-lg border p-4 ${mod.color}`}
                      key={mod.title}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`size-2 rounded-full ${mod.dot}`} />
                        <p className="font-semibold text-sm">{mod.title}</p>
                      </div>
                      <p className="mb-3 text-muted-foreground text-xs leading-relaxed">
                        {mod.desc}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <span className="text-muted-foreground text-xs">
                          Ej:
                        </span>
                        {mod.examples.map((ex) => (
                          <ExampleBadge key={ex}>{ex}</ExampleBadge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <InfoBox>
                  Los switches de asignación están al pie de esta misma página,
                  en la sección{" "}
                  <strong>&ldquo;Asignación por módulo&rdquo;</strong>. Cada
                  fila es un impuesto, y cada columna es un módulo.
                  Activás/desactivás con el toggle.
                </InfoBox>
              </div>
            </SectionCard>

            {/* ── IIBB explicado ───────────────────────────── */}
            <SectionCard
              color="border-amber-500/20 bg-amber-500/5"
              icon={<BuildingsIcon weight="duotone" />}
              subtitle="Ingresos Brutos, percepciones y retenciones — ¿cuál es cuál?"
              title="Entendiendo IIBB"
            >
              <div className="space-y-5">
                {/* Three types comparison */}
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      title: "IIBB (Ingresos Brutos)",
                      color: "border-amber-500/30",
                      badge:
                        "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                      desc: "El impuesto provincial que pagás sobre tus ventas. Lo declarás y pagás vos directamente a la DGR de tu provincia, mensualmente.",
                      who: "Lo paga: el vendedor",
                      example: 'Ej: "IIBB Santa Fe 3.5%"',
                    },
                    {
                      title: "Percepción IIBB",
                      color: "border-orange-500/30",
                      badge:
                        "bg-orange-500/10 text-orange-700 dark:text-orange-400",
                      desc: "Si tu organización está inscripta como agente de percepción, tenés que retenerle IIBB al comprador en cada factura. Ese importe lo ingresás a la DGR.",
                      who: "Lo cobra: el vendedor al comprador",
                      example: 'Ej: "Percepción IIBB CABA 2.5%"',
                    },
                    {
                      title: "Retención IIBB",
                      color: "border-rose-500/30",
                      badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                      desc: "Si tu comprador es agente de retención (está en el padrón), él te descuenta IIBB del pago. Vos recibís menos plata, pero podés computarlo como pago a cuenta.",
                      who: "Lo descuenta: el comprador al vendedor",
                      example: 'Ej: "Retención IIBB Buenos Aires 3%"',
                    },
                  ].map((item) => (
                    <div
                      className={`rounded-lg border p-4 ${item.color}`}
                      key={item.title}
                    >
                      <Badge className={`mb-2 text-xs ${item.badge}`}>
                        {item.title}
                      </Badge>
                      <p className="mb-2 text-sm leading-relaxed">
                        {item.desc}
                      </p>
                      <p className="mb-1 font-medium text-muted-foreground text-xs">
                        {item.who}
                      </p>
                      <code className="text-muted-foreground text-xs">
                        {item.example}
                      </code>
                    </div>
                  ))}
                </div>

                <Tip>
                  <strong>¿Sos agente de percepción?</strong> Tu contador te lo
                  dice. Si lo sos, importá la &ldquo;Percepción IIBB&rdquo; de
                  tu provincia y asignala al módulo de Ventas. Cada factura que
                  emitas va a incluir ese monto.
                </Tip>

                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="mb-2 font-medium text-sm">
                    ¿Operás en varias provincias? → Convenio Multilateral
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Si vendés en más de una provincia, probablemente estés
                    inscripto en el Convenio Multilateral (CM). En ese caso,
                    cada provincia recibe un porcentaje de tu base imponible.
                    Podés importar el IIBB de cada provincia donde operás y
                    ajustar la alícuota según los coeficientes del CM. Las
                    alícuotas del catálogo son orientativas — siempre verificar
                    con tu contador.
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* ── Retenciones nacionales ───────────────────── */}
            <SectionCard
              color="border-purple-500/20 bg-purple-500/5"
              icon={<ShieldCheckIcon weight="duotone" />}
              subtitle="Ganancias, IVA, SUSS — ¿cuándo aplican?"
              title="Retenciones nacionales (AFIP)"
            >
              <div className="space-y-5">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Las retenciones nacionales las practica el comprador (si es
                  agente de retención habilitado por AFIP) al pagarte. Vos
                  recibís el neto, y el comprador ingresa lo retenido a AFIP.
                  Podés computar las retenciones como pago a cuenta del
                  impuesto.
                </p>

                <div className="space-y-3">
                  {[
                    {
                      name: "Retención Ganancias",
                      code: "RG AFIP 830",
                      color: "border-purple-500/20",
                      desc: "La practica el comprador inscripto en Ganancias. Existen tablas de alícuotas (6% a 35%) según el importe acumulado. Verificar la escala vigente.",
                    },
                    {
                      name: "Retención IVA",
                      code: "RG AFIP 2854",
                      color: "border-blue-500/20",
                      desc: "10.5% para inscriptos en IVA. 21% para no inscriptos o sin CUIT. Solo la practican compradores habilitados como agentes.",
                    },
                    {
                      name: "Percepción IVA 5.25%",
                      code: "RG AFIP 2408",
                      color: "border-emerald-500/20",
                      desc: "El vendedor (si es agente de percepción habilitado) agrega el 5.25% sobre el IVA facturado. Es el 50% del débito fiscal.",
                    },
                    {
                      name: "Retención SUSS",
                      code: "Seg. Social",
                      color: "border-amber-500/20",
                      desc: "Se aplica sobre honorarios profesionales y servicios. 11% para inscriptos.",
                    },
                  ].map((item) => (
                    <div
                      className={`flex gap-4 rounded-lg border p-4 ${item.color}`}
                      key={item.name}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <p className="font-medium text-sm">{item.name}</p>
                          <Badge className="text-xs" variant="outline">
                            {item.code}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <Warning>
                  Las alícuotas de retenciones nacionales cambian
                  frecuentemente. Las del catálogo son orientativas.{" "}
                  <strong>Siempre verificar con tu contador</strong> antes de
                  usar en producción.
                </Warning>
              </div>
            </SectionCard>

            {/* ── Sellos ───────────────────────────────────── */}
            <SectionCard
              color="border-emerald-500/20 bg-emerald-500/5"
              icon={<ReceiptIcon weight="duotone" />}
              subtitle="¿Cuándo aplica el impuesto de sellos?"
              title="Impuesto de Sellos"
            >
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  El Impuesto de Sellos es provincial y grava ciertos actos
                  jurídicos (contratos de compraventa, locación, mutuos, etc.)
                  que se celebran en la provincia o tienen efectos en ella. No
                  aplica a todas las transacciones.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <CheckCircleIcon
                        className="size-4 text-emerald-500"
                        weight="fill"
                      />
                      <p className="font-medium text-sm">Cuándo aplica</p>
                    </div>
                    <ul className="space-y-1 text-muted-foreground text-xs">
                      <li>• Contratos de compraventa</li>
                      <li>• Contratos de locación de inmuebles</li>
                      <li>• Mutuos y préstamos</li>
                      <li>• Algunos tipos de facturas (varía por provincia)</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <LinkBreakIcon
                        className="size-4 text-rose-500"
                        weight="fill"
                      />
                      <p className="font-medium text-sm">Cuándo NO aplica</p>
                    </div>
                    <ul className="space-y-1 text-muted-foreground text-xs">
                      <li>• Operaciones con instrumentos verbales</li>
                      <li>• Algunas provincias lo eximen a monotributistas</li>
                      <li>• Contratos de trabajo</li>
                      <li>
                        • En algunas jurisdicciones: ventas al consumidor final
                      </li>
                    </ul>
                  </div>
                </div>
                <Tip>
                  Consultá con tu contador si tus operaciones están alcanzadas
                  por sellos en tu provincia. Si aplica, importalo desde el
                  catálogo y asignalo al módulo de Ventas.
                </Tip>
              </div>
            </SectionCard>

            {/* ── Código ARCA ──────────────────────────────── */}
            <SectionCard
              color="border-slate-500/20 bg-slate-500/5"
              icon={<CurrencyDollarIcon weight="duotone" />}
              subtitle="¿Qué es el código fiscal y para qué sirve?"
              title="Código ARCA (código fiscal)"
            >
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Cada impuesto en Argentina tiene un código que AFIP/ARCA
                  reconoce al emitir una factura electrónica. Sin este código,
                  el sistema no puede informar el impuesto correctamente y la
                  factura puede rechazarse.
                </p>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-2.5 text-left font-medium text-xs">
                          Código en el sistema
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-xs">
                          ID en AFIP WSFE
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-xs">
                          Qué incluye
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          code: "IVA_21",
                          afipId: "Iva.Id = 5",
                          desc: "IVA 21% alícuota general",
                        },
                        {
                          code: "IVA_10_5",
                          afipId: "Iva.Id = 4",
                          desc: "IVA 10.5% alícuota reducida",
                        },
                        {
                          code: "IIBB_PROVINCIAL",
                          afipId: "Tributos.Id = 2",
                          desc: "IIBB / Percepciones de cualquier provincia",
                        },
                        {
                          code: "TRIBUTO_NACIONAL",
                          afipId: "Tributos.Id = 1",
                          desc: "Retenciones AFIP (Ganancias, IVA, SUSS)",
                        },
                        {
                          code: "TRIBUTO_SELLOS",
                          afipId: "Tributos.Id = 5",
                          desc: "Impuesto de Sellos provincial",
                        },
                        {
                          code: "TRIBUTO_MUNICIPAL",
                          afipId: "Tributos.Id = 3",
                          desc: "Tasas municipales",
                        },
                      ].map((row, i) => (
                        <tr
                          className={
                            i % 2 === 0 ? "bg-background" : "bg-muted/10"
                          }
                          key={row.code}
                        >
                          <td className="px-4 py-2.5">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {row.code}
                            </code>
                          </td>
                          <td className="px-4 py-2.5">
                            <code className="text-muted-foreground text-xs">
                              {row.afipId}
                            </code>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {row.desc}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <InfoBox>
                  Todos los impuestos importados desde el catálogo ya tienen el
                  código ARCA correcto asignado. Si creás un impuesto manual,
                  elegí el código desde el dropdown en el formulario.
                </InfoBox>
              </div>
            </SectionCard>

            {/* ── FAQ ──────────────────────────────────────── */}
            <SectionCard
              color="border-border bg-muted/10"
              icon={<ListChecksIcon weight="duotone" />}
              subtitle="Preguntas frecuentes"
              title="FAQ"
            >
              <div className="space-y-4">
                {[
                  {
                    q: "¿Puedo cambiar la alícuota después de importar?",
                    a: "Sí. Hacé clic en los tres puntos (...) al lado del impuesto en la tabla y elegí Editar. Cambiá la tasa y guardá.",
                  },
                  {
                    q: "¿Qué pasa si mi provincia no está en el catálogo?",
                    a: 'Hacé clic en "Nuevo Impuesto", ingresá el nombre, la alícuota y elegí el código ARCA correcto (IIBB_PROVINCIAL para cualquier IIBB). El catálogo cubre las 24 provincias, pero podés crear impuestos personalizados.',
                  },
                  {
                    q: "¿Puedo asignar el mismo impuesto a varios módulos?",
                    a: "Sí. Por ejemplo, IVA 21% puede estar activo en Ventas, Notas de Crédito y Notas de Débito al mismo tiempo.",
                  },
                  {
                    q: "Si tengo IIBB y Percepción IIBB, ¿cuál asigno a Ventas?",
                    a: "Depende de tu situación. Si sos agente de percepción, asignás la Percepción IIBB a Ventas (porque se la cobrás al cliente). El IIBB propio lo declarás vos aparte a la DGR sin necesidad de asignarlo a módulos.",
                  },
                  {
                    q: "Las alícuotas del catálogo, ¿son exactas?",
                    a: "Son orientativas y reflejan alícuotas generales 2025. Las alícuotas pueden variar por actividad (NAIIB), por categoría de contribuyente y cambian periódicamente. Siempre verificar con tu contador.",
                  },
                  {
                    q: "¿Puedo eliminar un impuesto que importé por error?",
                    a: "Sí. Si aún no tiene movimientos, podés eliminarlo. Si ya se usó en facturas, se desactiva (queda inactivo) para preservar el historial.",
                  },
                ].map((item) => (
                  <div className="rounded-lg border p-4" key={item.q}>
                    <div className="mb-1.5 flex items-start gap-2">
                      <ArrowRightIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <p className="font-medium text-sm">{item.q}</p>
                    </div>
                    <p className="pl-5 text-muted-foreground text-sm leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <Separator />

            {/* Footer note */}
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <WarningIcon
                className="mt-0.5 size-4 shrink-0 text-amber-500"
                weight="fill"
              />
              <p className="text-amber-800 text-xs leading-relaxed dark:text-amber-300">
                <strong>Importante:</strong> Las alícuotas y normativas
                impositivas cambian con frecuencia en Argentina. Todo lo
                configurado acá es una herramienta de gestión — no reemplaza el
                asesoramiento de un contador matriculado. Verificar siempre con
                tu profesional contable antes de emitir comprobantes fiscales.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
