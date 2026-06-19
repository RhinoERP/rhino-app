"use client";

import { ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useCuentas,
  useLibroMayor,
} from "@/modules/accounting/queries/queries.client";

function defaultDesde(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultHasta(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  orgId: string;
};

export function LibroMayor({ orgId }: Props) {
  const [desde, setDesde] = useState(defaultDesde());
  const [hasta, setHasta] = useState(defaultHasta());
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [cuentaOpen, setCuentaOpen] = useState(false);

  const { data: cuentas = [] } = useCuentas(orgId);
  const { data, isLoading, isError, error } = useLibroMayor(cuentaId, {
    orgId,
    desde,
    hasta,
  });

  const selectedCuenta = cuentas.find((c) => c.id === cuentaId);
  const xlsxUrl = cuentaId
    ? `/api/contabilidad/mayor/${cuentaId}?org_id=${orgId}&desde=${desde}&hasta=${hasta}&format=xlsx`
    : undefined;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label>Cuenta</Label>
          <Popover onOpenChange={setCuentaOpen} open={cuentaOpen}>
            <PopoverTrigger asChild>
              <Button
                className="w-72 justify-between font-normal"
                role="combobox"
                variant="outline"
              >
                {selectedCuenta
                  ? `${selectedCuenta.codigo} — ${selectedCuenta.nombre}`
                  : "Seleccionar cuenta..."}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0">
              <Command>
                <CommandInput placeholder="Buscar cuenta..." />
                <CommandList>
                  <CommandEmpty>Sin resultados.</CommandEmpty>
                  <CommandGroup>
                    {cuentas.map((c) => (
                      <CommandItem
                        key={c.id}
                        onSelect={() => {
                          setCuentaId(c.id);
                          setCuentaOpen(false);
                        }}
                        value={`${c.codigo} ${c.nombre}`}
                      >
                        <span
                          className={cn(
                            "mr-2 h-2 w-2 rounded-full",
                            cuentaId === c.id ? "bg-primary" : "bg-transparent"
                          )}
                        />
                        <span className="mr-2 text-muted-foreground text-xs">
                          {c.codigo}
                        </span>
                        {c.nombre}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid gap-1.5">
          <Label>Desde</Label>
          <Input
            className="w-36"
            onChange={(e) => setDesde(e.target.value)}
            type="date"
            value={desde}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Hasta</Label>
          <Input
            className="w-36"
            onChange={(e) => setHasta(e.target.value)}
            type="date"
            value={hasta}
          />
        </div>
        {xlsxUrl && (
          <a download href={xlsxUrl}>
            <Button size="sm" variant="outline">
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Exportar XLSX
            </Button>
          </a>
        )}
      </div>

      {!cuentaId && (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Seleccioná una cuenta para ver su Mayor.
        </p>
      )}
      {isLoading && cuentaId && (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Cargando...
        </p>
      )}
      {isError && (
        <p className="py-8 text-center text-destructive text-sm">
          {error instanceof Error ? error.message : "Error al cargar el mayor"}
        </p>
      )}
      {data && (
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <p className="font-medium text-sm">
              {data.cuenta_nombre}
              {data.cuenta_codigo && (
                <span className="ml-2 font-normal text-muted-foreground">
                  ({data.cuenta_codigo})
                </span>
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              Saldo inicial:{" "}
              <span className="font-mono">
                {formatCurrency(Number(data.saldo_inicial))}
              </span>
            </p>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Saldo inicial row */}
                <TableRow className="bg-muted/40">
                  <TableCell className="text-xs">{desde}</TableCell>
                  <TableCell className="text-muted-foreground text-sm italic">
                    Saldo inicial del período
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-medium font-mono text-sm">
                    {formatCurrency(Number(data.saldo_inicial))}
                  </TableCell>
                </TableRow>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      className="py-8 text-center text-muted-foreground text-sm"
                      colSpan={5}
                    >
                      Sin movimientos en el período.
                    </TableCell>
                  </TableRow>
                )}
                {data.rows.map((row) => (
                  <TableRow key={row.linea_id}>
                    <TableCell className="text-xs">{row.fecha}</TableCell>
                    <TableCell className="text-sm">
                      {row.descripcion ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(row.debe) > 0
                        ? formatCurrency(Number(row.debe))
                        : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(row.haber) > 0
                        ? formatCurrency(Number(row.haber))
                        : ""}
                    </TableCell>
                    <TableCell className="text-right font-medium font-mono text-sm">
                      {formatCurrency(Number(row.saldo_acumulado))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
