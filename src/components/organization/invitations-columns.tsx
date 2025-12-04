"use client";

import { ArrowsDownUpIcon, TrashIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils";
import { cancelInvitationAction } from "@/modules/organizations/actions/manage-invitations.action";

export type InvitationRow = {
  id: string;
  invited_email: string;
  role?: {
    id: string;
    name: string;
    key: string;
  };
  is_owner: boolean;
  invitation_type: "one_time" | "multi_use";
  created_at: string;
  expires_at: string;
  invited_by?: {
    id: string;
    email: string | null;
    name: string | null;
  };
};

function InvitationActions({
  invitation,
  orgSlug,
}: {
  invitation: InvitationRow;
  orgSlug: string;
}) {
  const router = useRouter();
  const [isCanceling, setIsCanceling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setError(null);
    setIsCanceling(true);
    try {
      const result = await cancelInvitationAction(invitation.id, orgSlug);
      if (result.success) {
        setShowCancelDialog(false);
        router.refresh();
      } else {
        setError(result.error || "Error al cancelar la invitación");
      }
    } catch {
      setError("Error al cancelar la invitación");
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <>
      <Button
        disabled={isCanceling}
        onClick={() => setShowCancelDialog(true)}
        size="icon"
        variant="ghost"
      >
        <TrashIcon className="size-4" />
        <span className="sr-only">Cancelar invitación</span>
      </Button>

      <Dialog onOpenChange={setShowCancelDialog} open={showCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar invitación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas cancelar la invitación para{" "}
              <strong>{invitation.invited_email}</strong>? Esta acción no se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={isCanceling}
              onClick={() => setShowCancelDialog(false)}
              type="button"
              variant="outline"
            >
              No cancelar
            </Button>
            <Button
              disabled={isCanceling}
              onClick={handleCancel}
              type="button"
              variant="destructive"
            >
              {isCanceling ? "Cancelando..." : "Sí, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && !showCancelDialog && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-destructive text-xs">
          {error}
        </div>
      )}
    </>
  );
}

export function createInvitationsColumns(
  orgSlug: string
): ColumnDef<InvitationRow>[] {
  return [
    {
      id: "email",
      accessorKey: "invited_email",
      header: ({ column }) => (
        <Button
          className="px-0 text-left"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          type="button"
          variant="ghost"
        >
          Email
          <ArrowsDownUpIcon className="ml-2 size-4" weight="bold" />
        </Button>
      ),
      cell: ({ row }) => {
        const invitation = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{invitation.invited_email}</span>
            {invitation.invited_by && (
              <span className="text-muted-foreground text-sm">
                Invitado por:{" "}
                {invitation.invited_by.name ||
                  invitation.invited_by.email ||
                  "Desconocido"}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "role",
      header: "Rol",
      cell: ({ row }) => {
        const invitation = row.original;
        return (
          <Badge variant="secondary">
            {invitation.is_owner ? "Dueño" : invitation.role?.name || "Sin rol"}
          </Badge>
        );
      },
    },
    {
      id: "type",
      header: "Tipo",
      cell: ({ row }) => {
        const invitation = row.original;
        return (
          <Badge variant="outline">
            {invitation.invitation_type === "one_time" ? "Una vez" : "Múltiple"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "expires_at",
      header: ({ column }) => (
        <Button
          className="px-0 text-left"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          type="button"
          variant="ghost"
        >
          Expira
          <ArrowsDownUpIcon className="ml-2 size-4" weight="bold" />
        </Button>
      ),
      cell: ({ row }) => {
        const invitation = row.original;
        return (
          <div className="flex flex-col">
            <span>{formatDateTime(invitation.expires_at)}</span>
            <span className="text-muted-foreground text-xs">
              Creada {formatDateTime(invitation.created_at)}
            </span>
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const invitation = row.original;
        return <InvitationActions invitation={invitation} orgSlug={orgSlug} />;
      },
    },
  ];
}
