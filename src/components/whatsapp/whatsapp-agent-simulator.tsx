"use client";

import {
  ArrowClockwiseIcon,
  PaperPlaneTiltIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  SimulationOptions,
  SimulationSnapshot,
  SimulationState,
} from "@/modules/whatsapp/server/simulation";

type Message = { direction: "INBOUND" | "OUTBOUND"; content: string };
type ToolCall = { name: string; arguments: unknown };

async function postSimulation(params: {
  orgSlug: string;
  message: string;
  customerId?: string;
  priceListId?: string;
  state: SimulationState | undefined;
}) {
  const response = await fetch(
    `/api/org/${encodeURIComponent(params.orgSlug)}/whatsapp/simulacion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: params.message,
        customerId: params.customerId,
        priceListId: params.priceListId,
        state: params.state,
      }),
    }
  );
  const result = (await response.json()) as {
    response?: string;
    state?: SimulationState;
    snapshot?: SimulationSnapshot;
    toolCalls?: ToolCall[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error ?? "No se pudo procesar el mensaje");
  }
  return result;
}

export function WhatsAppAgentSimulator({
  orgSlug,
  options,
}: {
  orgSlug: string;
  options: SimulationOptions;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<SimulationState | undefined>();
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function processMessage(message: string) {
    const result = await postSimulation({
      orgSlug,
      message,
      customerId: state ? undefined : customerId,
      priceListId: state ? undefined : priceListId,
      state,
    });
    setMessages((current) =>
      result.response
        ? [...current, { direction: "OUTBOUND", content: result.response }]
        : current
    );
    if (result.state) {
      setState(result.state);
    }
    setSnapshot(result.snapshot ?? null);
    setToolCalls(result.toolCalls ?? []);
  }

  async function sendMessage() {
    const message = draft.trim();
    if (!message || busy) {
      return;
    }
    if (!(state || (customerId && priceListId))) {
      setError("Elegí un cliente y una lista de precios para empezar.");
      return;
    }
    setBusy(true);
    setError(null);
    setDraft("");
    setMessages((current) => [
      ...current,
      { direction: "INBOUND", content: message },
    ]);
    try {
      await processMessage(message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo procesar el mensaje"
      );
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([]);
    setState(undefined);
    setSnapshot(null);
    setToolCalls([]);
    setDraft("");
    setError(null);
  }

  const canStart =
    options.customers.length > 0 && options.priceLists.length > 0;

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex gap-3 py-4 text-sm">
          <SparkleIcon className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">
              Conectado a datos reales de producción
            </p>
            <p className="text-muted-foreground">
              El agente consulta el catálogo, los precios y el stock reales. Los
              mensajes se guardan como simulación y nunca se envían a WhatsApp.
              El carrito, la conversación y una preventa confirmada sí quedan
              guardados en Rhinos; la preventa queda como borrador y no reserva
              stock.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="flex min-h-[560px] flex-col">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Conversación de prueba
              </CardTitle>
              <CardDescription>
                Usa las herramientas comerciales reales de esta organización.
              </CardDescription>
            </div>
            <Button onClick={reset} size="sm" type="button" variant="outline">
              <ArrowClockwiseIcon className="mr-2 size-4" /> Reiniciar
            </Button>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            {state ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
                Sesión local · reiniciar inicia otra conversación y no borra los
                registros ya guardados.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 text-sm">
                  <p className="font-medium" id="simulator-customer-label">
                    Cliente de prueba
                  </p>
                  <Select
                    disabled={!options.customers.length || busy}
                    onValueChange={setCustomerId}
                    value={customerId}
                  >
                    <SelectTrigger aria-labelledby="simulator-customer-label">
                      <SelectValue placeholder="Elegí un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 text-sm">
                  <p className="font-medium" id="simulator-price-list-label">
                    Lista de precios
                  </p>
                  <Select
                    disabled={!options.priceLists.length || busy}
                    onValueChange={setPriceListId}
                    value={priceListId}
                  >
                    <SelectTrigger aria-labelledby="simulator-price-list-label">
                      <SelectValue placeholder="Elegí una lista" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.priceLists.map((priceList) => (
                        <SelectItem key={priceList.id} value={priceList.id}>
                          {priceList.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {canStart ? null : (
              <p className="text-destructive text-sm">
                Esta organización necesita al menos un cliente activo y una
                lista de precios activa para iniciar una prueba.
              </p>
            )}
            <div
              aria-live="polite"
              className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-md border bg-muted/20 p-4"
            >
              {messages.length ? null : (
                <p className="m-auto max-w-sm text-center text-muted-foreground text-sm">
                  Probá con una consulta sobre productos, pedí precio y stock,
                  agregá algo al carrito y confirmá expresamente si querés
                  registrar la preventa.
                </p>
              )}
              {messages.map((item, index) => (
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${item.direction === "INBOUND" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto border bg-background"}`}
                  key={`${index}-${item.direction}`}
                >
                  <p className="mb-1 text-xs opacity-70">
                    {item.direction === "INBOUND" ? "Cliente" : "Agente"}
                  </p>
                  <p className="whitespace-pre-wrap">{item.content}</p>
                </div>
              ))}
              {busy ? (
                <p className="mr-auto rounded-lg border bg-background px-3 py-2 text-muted-foreground text-sm">
                  Procesando…
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Textarea
                aria-label="Mensaje de prueba"
                disabled={!canStart || busy}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Escribí un mensaje…"
                value={draft}
              />
              {error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : null}
              <div className="flex justify-end">
                <Button
                  disabled={!canStart || busy || !draft.trim()}
                  onClick={sendMessage}
                  type="button"
                >
                  <PaperPlaneTiltIcon className="mr-2 size-4" /> Enviar a
                  simulación
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Estado en producción</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Carrito: {snapshot?.cartItemCount ?? 0} producto(s) ·{" "}
                {snapshot?.cartStatus ?? "vacío"}
              </p>
              <p>
                Preventa:{" "}
                {snapshot?.preSaleCreated ? "registrada" : "sin crear"}
              </p>
              <p>Derivación: {snapshot?.handoffReason ?? "sin derivar"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Herramientas usadas</CardTitle>
              <CardDescription>
                Herramientas comerciales conectadas a la base de producción.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {toolCalls.length ? (
                <ul className="space-y-2 text-xs">
                  {toolCalls.map((call, index) => (
                    <li
                      className="rounded-md bg-muted p-2 font-mono"
                      key={`${call.name}-${index}`}
                    >
                      {call.name}
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                        {JSON.stringify(call.arguments)}
                      </pre>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Todavía no se ejecutaron herramientas.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
