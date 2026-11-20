"use client";

import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  filterSearchableCatalog,
  type SearchableCatalogOption,
} from "@/lib/searchable-catalog";

export function SearchableCatalogPicker({
  label,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  disabled = false,
}: {
  label: string;
  options: SearchableCatalogOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);
  const selectionMissing = Boolean(value && !selected);
  const matches = useMemo(
    () => filterSearchableCatalog(options, query),
    [options, query]
  );

  function select(valueToSelect: string) {
    onChange(valueToSelect);
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
      open={open}
    >
      <div className="min-w-0 space-y-1">
        <DialogTrigger asChild>
          <Button
            aria-invalid={selectionMissing || undefined}
            aria-label={`${label}: ${selectionMissing ? "selección no disponible" : (selected?.label ?? placeholder)}`}
            className="h-auto min-h-11 w-full min-w-0 justify-start whitespace-normal text-left"
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <MagnifyingGlassIcon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {selectionMissing ? "Selección no disponible" : (selected?.label ?? placeholder)}
              </span>
              {selected?.description && (
                <span className="block truncate text-muted-foreground text-xs">
                  {selected.description}
                </span>
              )}
            </span>
          </Button>
        </DialogTrigger>
        {selectionMissing && (
          <p className="text-destructive text-sm" role="alert">
            La opción anterior ya no está disponible. Elegí otra.
          </p>
        )}
      </div>
      <DialogContent
        className="top-[calc(env(safe-area-inset-top)+1rem)] flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top))] translate-y-0 flex-col gap-3 overflow-hidden p-4 sm:top-1/2 sm:max-h-[85dvh] sm:max-w-lg sm:-translate-y-1/2"
        showCloseButton={false}
      >
        <DialogClose
          aria-label="Cerrar buscador"
          className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon className="size-5" />
        </DialogClose>
        <DialogHeader className="pr-11 text-left">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Buscá por nombre o referencia y elegí una opción.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label={searchPlaceholder}
          autoFocus
          className="h-11 shrink-0 text-base"
          enterKeyHint="done"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && matches.length > 0) {
              event.preventDefault();
              firstOptionRef.current?.focus();
            } else if (event.key === "Enter" && matches.length === 1) {
              event.preventDefault();
              select(matches[0].value);
            }
          }}
          placeholder={searchPlaceholder}
          value={query}
        />
        <p aria-live="polite" className="shrink-0 text-muted-foreground text-xs">
          {matches.length === 0
            ? "Sin coincidencias"
            : `${matches.length}${matches.length === 40 ? "+" : ""} opciones. ${matches.length === 1 ? "Presioná Enter para elegir." : "Usá Tab o flecha abajo para recorrerlas."}`}
        </p>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
          {matches.map((option, index) => (
            <Button
              aria-pressed={option.value === value}
              className="h-auto min-h-12 w-full min-w-0 justify-start whitespace-normal py-2 text-left"
              key={option.value}
              onClick={() => select(option.value)}
              ref={index === 0 ? firstOptionRef : undefined}
              type="button"
              variant="ghost"
            >
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{option.label}</span>
                {option.description && (
                  <span className="block break-words text-muted-foreground text-xs">
                    {option.description}
                  </span>
                )}
              </span>
            </Button>
          ))}
          {matches.length === 0 && (
            <p className="p-4 text-center text-muted-foreground text-sm">
              No hay coincidencias. Probá con otro nombre o referencia.
            </p>
          )}
          {matches.length === 40 && (
            <p className="p-2 text-center text-muted-foreground text-xs">
              Se muestran hasta 40 opciones. Escribí más para acotar la búsqueda.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
