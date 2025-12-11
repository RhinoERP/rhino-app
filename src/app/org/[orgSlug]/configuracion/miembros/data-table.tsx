"use client";

import { UserPlusIcon, UsersIcon } from "@phosphor-icons/react";
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
import { InviteMemberDialog } from "@/components/organization/invite-member-dialog";
import { createMembersColumns } from "@/components/organization/members-columns";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import type { OrganizationRole } from "@/modules/organizations/service/roles.service";

type MembersDataTableProps = {
  data: OrganizationMember[];
  orgSlug: string;
  roles: OrganizationRole[];
};

export function MembersDataTable({
  data,
  orgSlug,
  roles,
}: MembersDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(
    () => createMembersColumns(roles, orgSlug),
    [roles, orgSlug]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    enableGlobalFilter: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) =>
      (row as { user_id?: string }).user_id ?? `row-${row.organization_id}`,
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay miembros</EmptyTitle>
            <EmptyDescription>
              Aún no hay miembros en esta organización.
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
          globalFilterPlaceholder="Buscar por nombre o email..."
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
