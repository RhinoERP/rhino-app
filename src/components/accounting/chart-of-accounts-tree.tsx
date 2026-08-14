"use client";

import {
  CaretDownIcon,
  CaretRightIcon,
  PencilSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { CuentaItem, CuentaTreeNode } from "@/lib/accounting-client";
import { toggleCuentaEstadoAction } from "@/modules/accounting/actions/chart-of-accounts.action";
import { useCuentasArbol } from "@/modules/accounting/queries/queries.client";
import { AccountFormDialog } from "./account-form-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  orgId: string;
  orgSlug: string;
};

// ── Color helpers ─────────────────────────────────────────────────────────────

const TIPO_COLORS: Record<string, string> = {
  ACTIVO: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PASIVO:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  PN: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  INGRESO: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  EGRESO: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const TIPO_LABELS: Record<string, string> = {
  ACTIVO: "Activo",
  PASIVO: "Pasivo",
  PN: "Patrimonio Neto",
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
};

const TIPO_ORDER = ["ACTIVO", "PASIVO", "PN", "INGRESO", "EGRESO"];

// ── Toggle button ─────────────────────────────────────────────────────────────

function ToggleEstadoButton({
  canManage,
  cuenta,
  orgSlug,
}: {
  canManage: boolean;
  cuenta: CuentaItem;
  orgSlug: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      const result = await toggleCuentaEstadoAction(
        orgSlug,
        cuenta.id,
        checked
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(checked ? "Cuenta activada" : "Cuenta desactivada");
    });
  }

  if (!canManage) {
    return (
      <span
        className={
          cuenta.activa
            ? "text-emerald-600 text-sm"
            : "text-muted-foreground text-sm"
        }
      >
        {cuenta.activa ? "Activa" : "Inactiva"}
      </span>
    );
  }

  return (
    <Switch
      checked={cuenta.activa}
      disabled={isPending}
      onCheckedChange={handleToggle}
    />
  );
}

// ── Tree node row ─────────────────────────────────────────────────────────────

function TreeNodeRow({
  canManage,
  node,
  depth,
  orgId,
  orgSlug,
  onEdit,
}: {
  canManage: boolean;
  node: CuentaTreeNode;
  depth: number;
  orgId: string;
  orgSlug: string;
  onEdit: (cuenta: CuentaItem) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <tr
        className={
          node.activa
            ? "border-b transition-colors hover:bg-muted/40"
            : "border-b bg-muted/20 opacity-60 transition-colors hover:bg-muted/40"
        }
      >
        {/* Nombre + indent */}
        <td
          className="py-2 pr-3 pl-4"
          style={{ paddingLeft: `${16 + depth * 20}px` }}
        >
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded((v) => !v)}
                type="button"
              >
                {expanded ? (
                  <CaretDownIcon className="h-3 w-3" />
                ) : (
                  <CaretRightIcon className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            <span
              className={`text-sm ${node.activa ? "" : "text-muted-foreground line-through"}`}
            >
              {node.nombre}
            </span>
          </div>
        </td>

        {/* Código */}
        <td className="px-3 py-2">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {node.codigo}
          </code>
        </td>

        {/* Account code semántico */}
        <td className="px-3 py-2">
          {node.account_code ? (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
              {node.account_code}
            </code>
          ) : null}
        </td>

        {/* Tipo */}
        <td className="px-3 py-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${TIPO_COLORS[node.tipo] ?? "bg-gray-100 text-gray-800"}`}
          >
            {node.tipo}
          </span>
        </td>

        {/* Naturaleza */}
        <td className="px-3 py-2 text-sm">{node.naturaleza}</td>

        {/* Moneda */}
        <td className="px-3 py-2 text-muted-foreground text-xs">
          {node.moneda}
        </td>

        {/* Permite mov. */}
        <td className="px-3 py-2">
          {node.permite_movimientos ? (
            <Badge className="text-xs" variant="outline">
              Mov.
            </Badge>
          ) : null}
        </td>

        {/* Activa (toggle) */}
        <td className="px-3 py-2">
          <ToggleEstadoButton
            canManage={canManage}
            cuenta={node}
            orgSlug={orgSlug}
          />
        </td>

        {/* Acciones */}
        <td className="px-3 py-2">
          {canManage && (
            <Button
              className="h-7 w-7"
              onClick={() => onEdit(node)}
              size="icon"
              title="Editar cuenta"
              variant="ghost"
            >
              <PencilSimpleIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </td>
      </tr>

      {/* Children recursivos */}
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <TreeNodeRow
            canManage={canManage}
            depth={depth + 1}
            key={child.id}
            node={child}
            onEdit={onEdit}
            orgId={orgId}
            orgSlug={orgSlug}
          />
        ))}
    </>
  );
}

// ── Section by tipo ───────────────────────────────────────────────────────────

function TipoSection({
  canManage,
  tipo,
  nodes,
  orgId,
  orgSlug,
  onEdit,
  onNew,
}: {
  canManage: boolean;
  tipo: string;
  nodes: CuentaTreeNode[];
  orgId: string;
  orgSlug: string;
  onEdit: (cuenta: CuentaItem) => void;
  onNew: (tipo: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-md border">
      {/* Section header */}
      <div className="flex w-full items-center gap-2 border-b bg-muted/30 px-4 py-2.5 transition-colors hover:bg-muted/50">
        <button
          className="flex flex-1 items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          {expanded ? (
            <CaretDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <CaretRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-xs ${TIPO_COLORS[tipo] ?? "bg-gray-100 text-gray-800"}`}
          >
            {tipo}
          </span>
          <span className="text-muted-foreground text-sm">
            {TIPO_LABELS[tipo] ?? tipo}
          </span>
          <Badge className="ml-1 text-xs" variant="secondary">
            {nodes.length}
          </Badge>
        </button>
        <div className="ml-auto">
          {canManage && (
            <Button
              className="h-6 gap-1 text-xs"
              onClick={() => onNew(tipo)}
              size="sm"
              variant="ghost"
            >
              <PlusIcon className="h-3 w-3" />
              Nueva cuenta
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/10 text-left text-muted-foreground text-xs">
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Account code</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Naturaleza</th>
                <th className="px-3 py-2 font-medium">Moneda</th>
                <th className="px-3 py-2 font-medium">Flags</th>
                <th className="px-3 py-2 font-medium">Activa</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <TreeNodeRow
                  canManage={canManage}
                  depth={0}
                  key={node.id}
                  node={node}
                  onEdit={onEdit}
                  orgId={orgId}
                  orgSlug={orgSlug}
                />
              ))}
              {nodes.length === 0 && (
                <tr>
                  <td
                    className="py-6 text-center text-muted-foreground text-sm"
                    colSpan={9}
                  >
                    Sin cuentas en esta categoría
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChartOfAccountsTree({ orgId, orgSlug }: Props) {
  const { can } = usePermissions();
  const canManage = can("accounting.manage");
  const {
    data: arbol = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCuentasArbol(orgId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<CuentaItem | undefined>();
  const [defaultTipo, setDefaultTipo] = useState<string | undefined>();

  function handleEdit(cuenta: CuentaItem) {
    setEditingCuenta(cuenta);
    setDefaultTipo(undefined);
    setDialogOpen(true);
  }

  function handleNew(tipo?: string) {
    setEditingCuenta(undefined);
    setDefaultTipo(tipo);
    setDialogOpen(true);
  }

  function handleDialogClose(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setEditingCuenta(undefined);
      setDefaultTipo(undefined);
    }
  }

  if (isLoading) {
    return (
      <p className="py-12 text-center text-muted-foreground text-sm">
        Cargando plan de cuentas...
      </p>
    );
  }

  if (isError) {
    return (
      <p className="py-12 text-center text-destructive text-sm">
        {error instanceof Error
          ? error.message
          : "Error al cargar el plan de cuentas"}
      </p>
    );
  }

  // Group root nodes by tipo preserving order
  const byTipo = new Map<string, CuentaTreeNode[]>();
  for (const tipo of TIPO_ORDER) {
    byTipo.set(tipo, []);
  }
  for (const node of arbol) {
    const list = byTipo.get(node.tipo);
    if (list) {
      list.push(node);
    } else {
      byTipo.set(node.tipo, [node]);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {arbol.length} cuenta{arbol.length !== 1 ? "s" : ""} raíz
        </p>
        {canManage && (
          <Button
            className="gap-2"
            onClick={() => handleNew()}
            size="sm"
            variant="default"
          >
            <PlusIcon className="h-4 w-4" />
            Nueva cuenta
          </Button>
        )}
      </div>

      {/* Sections by tipo */}
      {TIPO_ORDER.map((tipo) => {
        const nodes = byTipo.get(tipo) ?? [];
        return (
          <TipoSection
            canManage={canManage}
            key={tipo}
            nodes={nodes}
            onEdit={handleEdit}
            onNew={handleNew}
            orgId={orgId}
            orgSlug={orgSlug}
            tipo={tipo}
          />
        );
      })}

      {/* Create / Edit dialog */}
      <AccountFormDialog
        cuenta={editingCuenta}
        defaultTipo={
          defaultTipo as
            | "ACTIVO"
            | "PASIVO"
            | "PN"
            | "INGRESO"
            | "EGRESO"
            | undefined
        }
        onOpenChange={handleDialogClose}
        onSuccess={() => refetch()}
        open={dialogOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </div>
  );
}
