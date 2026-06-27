"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInformalEntries } from "@/modules/accounting/queries/queries.client";

type Props = {
  orgId: string;
  orgSlug: string;
};

type FilterEstado = "PENDIENTE" | "CANCELADO" | "ASENTADO" | "all";
type FilterSourceType =
  | "NOTA_DE_VENTA"
  | "FACTURA_PENDIENTE"
  | "COMPRA"
  | "NOTA_DE_CREDITO"
  | "COBRO"
  | "ORDEN_PAGO"
  | "all";

const ESTADO_BADGE: Record<
  "PENDIENTE" | "CANCELADO" | "ASENTADO",
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  PENDIENTE: { label: "Pendiente", variant: "default" },
  CANCELADO: { label: "Cancelado", variant: "destructive" },
  ASENTADO: { label: "Asentado", variant: "outline" },
};

const SOURCE_LABEL: Record<
  | "NOTA_DE_VENTA"
  | "FACTURA_PENDIENTE"
  | "COMPRA"
  | "NOTA_DE_CREDITO"
  | "COBRO"
  | "ORDEN_PAGO",
  string
> = {
  NOTA_DE_VENTA: "Nota de Venta",
  FACTURA_PENDIENTE: "Factura Pendiente",
  COMPRA: "Compra",
  NOTA_DE_CREDITO: "Nota de Crédito",
  COBRO: "Cobro",
  ORDEN_PAGO: "Orden de Pago",
};

export function AsientosPendientes({ orgId, orgSlug }: Props) {
  const [filterEstado, setFilterEstado] = useState<FilterEstado>("PENDIENTE");
  const [filterSourceType, setFilterSourceType] =
    useState<FilterSourceType>("all");

  const {
    data: entries,
    isLoading,
    isError,
  } = useInformalEntries({
    orgId,
    estadoFormalizacion: filterEstado === "all" ? undefined : filterEstado,
    sourceType: filterSourceType === "all" ? undefined : filterSourceType,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Estado</span>
          <Select
            onValueChange={(v) => setFilterEstado(v as FilterEstado)}
            value={filterEstado}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PENDIENTE">Pendiente</SelectItem>
              <SelectItem value="CANCELADO">Cancelado</SelectItem>
              <SelectItem value="ASENTADO">Asentado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Tipo</span>
          <Select
            onValueChange={(v) => setFilterSourceType(v as FilterSourceType)}
            value={filterSourceType}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="NOTA_DE_VENTA">Nota de Venta</SelectItem>
              <SelectItem value="FACTURA_PENDIENTE">
                Factura Pendiente
              </SelectItem>
              <SelectItem value="COMPRA">Compra</SelectItem>
              <SelectItem value="NOTA_DE_CREDITO">Nota de Crédito</SelectItem>
              <SelectItem value="COBRO">Cobro</SelectItem>
              <SelectItem value="ORDEN_PAGO">Orden de Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Cargando asientos...</p>
      )}
      {isError && (
        <p className="text-destructive text-sm">
          Error al cargar los asientos informales.
        </p>
      )}

      {!(isLoading || isError) && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Tipo evento</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground text-sm"
                    colSpan={6}
                  >
                    No hay asientos informales con los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                entries?.map((entry) => {
                  const badgeConfig = ESTADO_BADGE[entry.estado_formalizacion];
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">
                        {entry.fecha.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.descripcion ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {entry.tipo_evento ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {SOURCE_LABEL[entry.source_type]}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeConfig.variant}>
                          {badgeConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/org/${orgSlug}/contabilidad/pendientes/${entry.id}`}
                          >
                            Ver detalle
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
