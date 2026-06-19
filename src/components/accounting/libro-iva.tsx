"use client";

import { ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";
import { useLibroIVA } from "@/modules/accounting/queries/queries.client";

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

function IVATable({
  orgId,
  desde,
  hasta,
  tipo,
}: {
  orgId: string;
  desde: string;
  hasta: string;
  tipo: "ventas" | "compras";
}) {
  const { data, isLoading, isError, error } = useLibroIVA({
    orgId,
    desde,
    hasta,
    tipo,
  });

  const total = data?.rows.reduce(
    (acc, r) => ({
      neto: acc.neto + Number(r.neto_gravado),
      iva: acc.iva + Number(r.iva),
      total: acc.total + Number(r.total),
    }),
    { neto: 0, iva: 0, total: 0 }
  );

  if (isLoading) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        Cargando...
      </p>
    );
  }
  if (isError) {
    return (
      <p className="py-8 text-center text-destructive text-sm">
        {error instanceof Error ? error.message : "Error al cargar IVA"}
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead className="text-right">Neto Gravado</TableHead>
            <TableHead className="text-right">IVA</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(!data || data.rows.length === 0) && (
            <TableRow>
              <TableCell
                className="py-8 text-center text-muted-foreground text-sm"
                colSpan={6}
              >
                Sin registros en el período.
              </TableCell>
            </TableRow>
          )}
          {data?.rows.map((row) => (
            <TableRow key={row.journal_entry_id}>
              <TableCell className="text-xs">{row.fecha}</TableCell>
              <TableCell className="text-xs">
                {row.tipo_evento ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {row.referencia ?? "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatCurrency(Number(row.neto_gravado))}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatCurrency(Number(row.iva))}
              </TableCell>
              <TableCell className="text-right font-medium font-mono text-sm">
                {formatCurrency(Number(row.total))}
              </TableCell>
            </TableRow>
          ))}
          {total && data && data.rows.length > 0 && (
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={3}>Totales</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(total.neto)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(total.iva)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(total.total)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function LibroIVA({ orgId }: Props) {
  const [desde, setDesde] = useState(defaultDesde());
  const [hasta, setHasta] = useState(defaultHasta());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
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
        <div className="flex gap-2">
          <a
            download
            href={`/api/contabilidad/libros/iva?org_id=${orgId}&desde=${desde}&hasta=${hasta}&tipo=ventas&format=xlsx`}
          >
            <Button size="sm" variant="outline">
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              XLSX Ventas
            </Button>
          </a>
          <a
            download
            href={`/api/contabilidad/libros/iva?org_id=${orgId}&desde=${desde}&hasta=${hasta}&tipo=compras&format=xlsx`}
          >
            <Button size="sm" variant="outline">
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              XLSX Compras
            </Button>
          </a>
        </div>
      </div>

      <Tabs defaultValue="ventas">
        <TabsList>
          <TabsTrigger value="ventas">IVA Ventas</TabsTrigger>
          <TabsTrigger value="compras">IVA Compras</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" value="ventas">
          <IVATable desde={desde} hasta={hasta} orgId={orgId} tipo="ventas" />
        </TabsContent>
        <TabsContent className="mt-4" value="compras">
          <IVATable desde={desde} hasta={hasta} orgId={orgId} tipo="compras" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
