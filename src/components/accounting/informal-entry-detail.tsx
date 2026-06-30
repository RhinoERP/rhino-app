"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import {
  useCuentas,
  useInformalEntry,
} from "@/modules/accounting/queries/queries.client";

type InformalEntryDetailProps = {
  orgId: string;
  orgSlug: string;
  entryId: string;
};

const FORMALIZATION_BADGE: Record<
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

function formatAmount(value: string): string {
  const amount = Number(value);
  return amount > 0 ? formatCurrency(amount) : "";
}

export function InformalEntryDetail({
  orgId,
  orgSlug,
  entryId,
}: InformalEntryDetailProps) {
  const {
    data: entry,
    isError,
    isLoading,
  } = useInformalEntry({
    orgId,
    entryId,
  });
  const { data: cuentas = [] } = useCuentas(orgId);
  const accountById = useMemo(
    () => new Map(cuentas.map((cuenta) => [cuenta.id, cuenta])),
    [cuentas]
  );

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Cargando asiento...</p>;
  }

  if (isError || !entry) {
    return (
      <div className="space-y-4">
        <Button asChild size="sm" variant="outline">
          <Link href={`/org/${orgSlug}/contabilidad/pendientes`}>
            Volver a pendientes
          </Link>
        </Button>
        <p className="text-destructive text-sm">
          No se pudo cargar el asiento informal.
        </p>
      </div>
    );
  }

  const badgeConfig = FORMALIZATION_BADGE[entry.estado_formalizacion];
  const canFormalize = entry.estado_formalizacion === "PENDIENTE";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="sm" variant="outline">
          <Link href={`/org/${orgSlug}/contabilidad/pendientes`}>
            Volver a pendientes
          </Link>
        </Button>
        <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
        <Badge
          variant={
            entry.estado_imputacion === "COMPLETO" ? "secondary" : "destructive"
          }
        >
          {entry.estado_imputacion}
        </Badge>
        <div className="ml-auto">
          {canFormalize ? (
            <Button disabled type="button">
              <CheckCircleIcon className="mr-2 size-4" weight="duotone" />
              Formalizar
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {entry.descripcion ?? "Asiento informal"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Fecha</p>
            <p className="font-medium">{entry.fecha.slice(0, 10)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tipo evento</p>
            <p className="font-medium">{entry.tipo_evento ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Origen</p>
            <p className="font-medium">{entry.source_type}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Líneas del asiento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.lineas.map((linea) => {
                  const cuenta = linea.cuenta_id
                    ? accountById.get(linea.cuenta_id)
                    : null;

                  return (
                    <TableRow key={linea.id}>
                      <TableCell className="text-sm">
                        {cuenta ? (
                          <span>
                            {cuenta.nombre}
                            <span className="ml-1 text-muted-foreground text-xs">
                              ({cuenta.codigo})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Sin cuenta
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {linea.descripcion ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatAmount(linea.debe)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatAmount(linea.haber)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
