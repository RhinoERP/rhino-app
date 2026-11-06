"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SuggestedQuote = {
  venta: number;
  fechaActualizacion?: string;
};

const QUOTE_TTL_MS = 5 * 60 * 1000;
let quoteCache: { quote: SuggestedQuote; fetchedAt: number } | null = null;
let quoteRequest: Promise<SuggestedQuote> | null = null;

function loadSuggestedQuote(): Promise<SuggestedQuote> {
  if (quoteCache && Date.now() - quoteCache.fetchedAt < QUOTE_TTL_MS) {
    return Promise.resolve(quoteCache.quote);
  }
  if (quoteRequest) {
    return quoteRequest;
  }
  quoteRequest = fetch("/api/exchange-rate/usd")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("quote unavailable");
      }
      const data = await response.json();
      if (!(Number.isFinite(data.venta) && data.venta > 0)) {
        throw new Error("invalid quote");
      }
      const quote: SuggestedQuote = {
        venta: data.venta,
        fechaActualizacion:
          typeof data.fechaActualizacion === "string"
            ? data.fechaActualizacion
            : undefined,
      };
      quoteCache = { quote, fetchedAt: Date.now() };
      return quote;
    })
    .finally(() => {
      quoteRequest = null;
    });
  return quoteRequest;
}

export function FiscalExchangeRateInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [message, setMessage] = useState(
    "Cotización sugerida BNA; podés modificarla antes de emitir."
  );
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    if (latest.current.value) {
      return;
    }
    let active = true;
    loadSuggestedQuote()
      .then((quote) => {
        if (!active) {
          return;
        }
        // Never overwrite a value typed while the suggestion was loading.
        if (!latest.current.value) {
          latest.current.onChange(String(quote.venta));
        }
        setMessage(
          quote.fechaActualizacion
            ? `Sugerencia BNA (${quote.fechaActualizacion}). Editable antes de emitir.`
            : "Sugerencia BNA. Editable antes de emitir."
        );
      })
      .catch(() => {
        if (active) {
          setMessage(
            "Cotización BNA no disponible. Ingresá el valor manualmente."
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Cotización fiscal USD → ARS</Label>
      <Input
        disabled={disabled}
        id={id}
        min="0"
        onChange={(event) => onChange(event.target.value)}
        step="any"
        type="number"
        value={value}
      />
      <p className="text-muted-foreground text-xs">
        {message} Queda fija al emitir; ARCA valida el valor enviado.
      </p>
    </div>
  );
}
