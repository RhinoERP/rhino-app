"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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

// ---------------------------------------------------------------
// Tab: Plan de cuentas
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

// ---------------------------------------------------------------
// Tab: Reglas por evento
// ---------------------------------------------------------------

function ReglasTab({ orgId }: { orgId: string }) {
  const { data: reglas = [], isLoading, isError, error } = useReglas(orgId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Group by tipo_evento preserving insertion order
  const grouped = reglas.reduce<{ tipoEvento: string; rules: typeof reglas }[]>(
    (acc, regla) => {
      const group = acc.find((g) => g.tipoEvento === regla.tipo_evento);
      if (group) {
        group.rules.push(regla);
      } else {
        acc.push({ tipoEvento: regla.tipo_evento, rules: [regla] });
      }
      return acc;
    },
    []
  );

  return (
    <div className="space-y-6">
      {grouped.map(({ tipoEvento, rules }) => (
        <div className="space-y-2" key={tipoEvento}>
          <h3 className="font-semibold text-sm">{tipoEvento}</h3>
          <div className="space-y-2">
            {rules.map((rule) => {
              const isOpen = expandedId === rule.id;
              return (
                <div className="rounded-md border" key={rule.id}>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                    onClick={() => setExpandedId(isOpen ? null : rule.id)}
                    type="button"
                  >
                    {rule.condicion ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {typeof rule.condicion === "string"
                          ? rule.condicion
                          : JSON.stringify(rule.condicion)}
                      </code>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">
                        Sin condición — aplica siempre
                      </span>
                    )}
                    {rule.descripcion && (
                      <span className="ml-1 text-muted-foreground text-xs">
                        — {rule.descripcion}
                      </span>
                    )}
                    {!rule.activa && (
                      <Badge className="ml-auto text-xs" variant="secondary">
                        Inactiva
                      </Badge>
                    )}
                    <span className="ml-auto text-muted-foreground text-xs">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t">
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
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------

type Props = { orgId: string };

export function PlanCuentasPage({ orgId }: Props) {
  return (
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
  );
}
