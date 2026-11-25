"use client";

import {
  PencilSimpleIcon,
  PlusIcon,
  ShieldCheckIcon,
  WarehouseIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WarehouseAssignmentsDialog } from "@/components/warehouses/warehouse-assignments-dialog";
import { WarehouseDialog } from "@/components/warehouses/warehouse-dialog";
import { warehouseAdministrationQueryOptions } from "@/modules/inventory/queries/warehouse-administration.queries";
import type {
  ManagedWarehouse,
  WarehouseAssignmentMember,
} from "@/modules/inventory/warehouse-admin.types";

function WarehouseChannels({ warehouse }: { warehouse: ManagedWarehouse }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {warehouse.wholesale_enabled && (
        <Badge variant="outline">Mayorista</Badge>
      )}
      {warehouse.direct_sale_enabled && (
        <Badge variant="outline">Venta directa</Badge>
      )}
    </div>
  );
}

function MemberWarehouseAccess({
  member,
  warehouseById,
}: {
  member: WarehouseAssignmentMember;
  warehouseById: Map<string, ManagedWarehouse>;
}) {
  if (member.hasAllAccess) {
    return (
      <Badge className="gap-1" variant="outline">
        <ShieldCheckIcon className="size-3.5" weight="fill" />
        Acceso total
      </Badge>
    );
  }

  if (member.warehouseIds.length === 0) {
    return <span className="text-muted-foreground text-sm">Sin depósitos</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {member.warehouseIds.map((warehouseId) => (
        <Badge key={warehouseId} variant="secondary">
          {warehouseById.get(warehouseId)?.name ?? "Depósito no disponible"}
        </Badge>
      ))}
    </div>
  );
}

export function WarehouseAdministration({ orgSlug }: { orgSlug: string }) {
  const { data, isPending, isError, error } = useQuery(
    warehouseAdministrationQueryOptions(orgSlug)
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedWarehouse | null>(null);
  const [assigning, setAssigning] = useState<WarehouseAssignmentMember | null>(
    null
  );

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm">
        {error instanceof Error
          ? error.message
          : "No se pudo cargar la administración de depósitos"}
      </div>
    );
  }

  if (isPending || !data) {
    return (
      <div className="text-muted-foreground text-sm">Cargando depósitos...</div>
    );
  }

  const warehouseById = new Map(
    data.warehouses.map((warehouse) => [warehouse.id, warehouse])
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg">Depósitos</h2>
            <p className="text-muted-foreground text-sm">
              Los depósitos inactivos no se ofrecen en nuevas operaciones y no
              se pueden usar para despachar.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            Nuevo depósito
          </Button>
        </div>

        {data.warehouses.length === 0 ? (
          <div className="rounded-md border">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WarehouseIcon className="size-6" weight="duotone" />
                </EmptyMedia>
                <EmptyTitle>No hay depósitos</EmptyTitle>
                <EmptyDescription>
                  Creá el primer depósito para operar con inventario.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Canales</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.warehouses.map((warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{warehouse.name}</span>
                        {warehouse.is_default && (
                          <Badge variant="secondary">Principal</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {warehouse.code || "—"}
                    </TableCell>
                    <TableCell>
                      <WarehouseChannels warehouse={warehouse} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={warehouse.is_active ? "outline" : "secondary"}
                      >
                        {warehouse.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          aria-label={`Editar ${warehouse.name}`}
                          onClick={() => setEditing(warehouse)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <PencilSimpleIcon className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-lg">Acceso por usuario</h2>
          <p className="text-muted-foreground text-sm">
            Los propietarios y quienes tienen el permiso «organization.admin»
            acceden a todos los depósitos. El resto necesita asignaciones
            activas.
          </p>
        </div>

        {data.members.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-muted-foreground text-sm">
            No hay miembros activos con acceso a depósitos.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miembro</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Depósitos</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="font-medium">{member.name}</p>
                        {member.email && member.email !== member.name && (
                          <p className="text-muted-foreground text-xs">
                            {member.email}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{member.roleName}</TableCell>
                    <TableCell>
                      <MemberWarehouseAccess
                        member={member}
                        warehouseById={warehouseById}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          disabled={member.hasAllAccess}
                          onClick={() => setAssigning(member)}
                          size="sm"
                          variant="outline"
                        >
                          Asignar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {createOpen && (
        <WarehouseDialog
          onClose={() => setCreateOpen(false)}
          orgSlug={orgSlug}
          warehouse={null}
        />
      )}
      {editing && (
        <WarehouseDialog
          onClose={() => setEditing(null)}
          orgSlug={orgSlug}
          warehouse={editing}
        />
      )}
      {assigning && (
        <WarehouseAssignmentsDialog
          member={assigning}
          onClose={() => setAssigning(null)}
          orgSlug={orgSlug}
          warehouses={data.warehouses}
        />
      )}
    </div>
  );
}
