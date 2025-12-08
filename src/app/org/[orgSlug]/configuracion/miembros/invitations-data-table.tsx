"use client";

import { EnvelopeOpenIcon, UserPlusIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import {
  createInvitationsColumns,
  type InvitationRow,
} from "@/components/organization/invitations-columns";
import { InviteMemberDialog } from "@/components/organization/invite-member-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { OrganizationRole } from "@/modules/organizations/service/roles.service";

type InvitationsDataTableProps = {
  data: InvitationRow[];
  orgSlug: string;
  roles: OrganizationRole[];
};

export function InvitationsDataTable({
  data,
  orgSlug,
  roles,
}: InvitationsDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(() => createInvitationsColumns(orgSlug), [orgSlug]);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <EnvelopeOpenIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay invitaciones</EmptyTitle>
            <EmptyDescription>
              No hay ninguna invitación pendiente en esta organización. Invita
              un nuevo miembro para que pueda acceder a la organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <InviteMemberDialog orgSlug={orgSlug} roles={roles} />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar por email o rol..."
          showViewOptions={false}
          table={table}
        >
          <InviteMemberDialog
            orgSlug={orgSlug}
            roles={roles}
            trigger={
              <Button>
                <UserPlusIcon className="size-4" />
                Invitar
              </Button>
            }
          />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
