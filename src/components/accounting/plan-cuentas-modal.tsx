"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCuentas,
  useReglas,
} from "@/modules/accounting/queries/queries.client";

// ---------------------------------------------------------------
// Color maps
// ---------------------------------------------------------------
const TIPO_COLORS: Record<string, string> = {
  ACTIVO: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PASIVO:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  PATRIMONIO:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  RESULTADO:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  RESULTADO_NEGATIVO:
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  ORDEN: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const LADO_COLORS: Record<string, string> = {
  DEBE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  HABER: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

function formatRuleCondition(
  condition: string | Record<string, unknown> | null
) {
  if (!condition) {
    return null;
  }

  return typeof condition === "string" ? condition : JSON.stringify(condition);
}

// ---------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------

function PlanCuentasTab({ orgId }: { orgId: string }) {
  const { data: cuentas = [], isLoading, isError, error } = useCuentas(orgId);

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
        {error instanceof Error ? error.message : "Error al cargar cuentas"}
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Account code</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Naturaleza</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cuentas.length === 0 && (
            <TableRow>
              <TableCell
                className="py-8 text-center text-muted-foreground text-sm"
                colSpan={5}
              >
                Sin cuentas cargadas.
              </TableCell>
            </TableRow>
          )}
          {cuentas.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
              <TableCell className="text-sm">{c.nombre}</TableCell>
              <TableCell>
                {c.account_code ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {c.account_code}
                  </code>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${TIPO_COLORS[c.tipo] ?? "bg-gray-100 text-gray-800"}`}
                >
                  {c.tipo}
                </span>
              </TableCell>
              <TableCell className="text-sm">{c.naturaleza}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReglasTab({ orgId }: { orgId: string }) {
  const { data: reglas = [], isLoading, isError, error } = useReglas(orgId);

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
        {error instanceof Error ? error.message : "Error al cargar reglas"}
      </p>
    );
  }
  if (reglas.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        Sin reglas contables cargadas.
      </p>
    );
  }

  // Group by tipo_evento
  const grouped = reglas.reduce<Record<string, typeof reglas>>((acc, regla) => {
    const key = regla.tipo_evento;
    const existing = acc[key] ?? [];
    existing.push(regla);
    acc[key] = existing;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([tipoEvento, rules]) => (
        <div className="space-y-2" key={tipoEvento}>
          <h3 className="font-medium">{tipoEvento}</h3>
          <div className="space-y-3">
            {rules.map((rule) => (
              <div className="rounded-md border" key={rule.id}>
                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                  {formatRuleCondition(rule.condicion) ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {formatRuleCondition(rule.condicion)}
                    </code>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Sin condición (aplica siempre)
                    </span>
                  )}
                  {!rule.activa && (
                    <Badge className="ml-auto text-xs" variant="secondary">
                      Inactiva
                    </Badge>
                  )}
                  {rule.descripcion && (
                    <span className="ml-auto text-muted-foreground text-xs">
                      {rule.descripcion}
                    </span>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Lado</TableHead>
                      <TableHead>Account code</TableHead>
                      <TableHead>Fórmula</TableHead>
                      <TableHead className="w-32">Tipo línea</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rule.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${LADO_COLORS[line.lado] ?? ""}`}
                          >
                            {line.lado}
                          </span>
                        </TableCell>
                        <TableCell>
                          {line.account_code ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {line.account_code}
                            </code>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {line.formula}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className="text-xs"
                            variant={line.fija ? "secondary" : "outline"}
                          >
                            {line.fija ? "Fija" : "Seleccionable"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------

type Props = { orgId: string };

export function PlanCuentasModal({ orgId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <BookOpen className="mr-2 h-4 w-4" />
          Plan de cuentas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plan de cuentas y reglas contables</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="cuentas">
          <TabsList>
            <TabsTrigger value="cuentas">Plan de cuentas</TabsTrigger>
            <TabsTrigger value="reglas">Reglas por evento</TabsTrigger>
          </TabsList>
          <TabsContent className="mt-4" value="cuentas">
            <PlanCuentasTab orgId={orgId} />
          </TabsContent>
          <TabsContent className="mt-4" value="reglas">
            <ReglasTab orgId={orgId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
