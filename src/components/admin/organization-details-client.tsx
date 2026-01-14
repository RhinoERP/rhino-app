"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Lock,
  LockOpen,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toggleOrganizationStatusAction } from "@/modules/organizations/actions/toggle-organization-status.action";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import type { OrganizationRole } from "@/modules/organizations/service/roles.service";
import type { Organization } from "@/modules/organizations/types";
import { OrganizationMembersTable } from "./organization-members-table";

type OrganizationDetailsClientProps = {
  organization: Organization;
  members: OrganizationMember[];
  roles: OrganizationRole[];
};

function formatDate(dateString: string | null): string {
  if (!dateString) {
    return "-";
  }
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-AR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return "-";
  }
}

export function OrganizationDetailsClient({
  organization,
  members,
  roles,
}: OrganizationDetailsClientProps) {
  const [isActive, setIsActive] = useState(organization.is_active ?? true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleStatus = async () => {
    setError(null);
    setIsUpdating(true);

    try {
      const result = await toggleOrganizationStatusAction(
        organization.id,
        !isActive
      );

      if (!result.success) {
        setError(result.error || "Error al actualizar la organización");
        setIsUpdating(false);
        return;
      }

      setIsActive(!isActive);
      setShowConfirmDialog(false);
    } catch (err) {
      setError("Error desconocido al actualizar la organización");
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl">{organization.name}</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los detalles y usuarios de esta organización
          </p>
        </div>
      </div>

      {/* Organization Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Información de la Organización</CardTitle>
          <CardDescription>
            Detalles generales de la organización
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-sm">Nombre</div>
              <p className="font-medium">{organization.name}</p>
            </div>
            <div>
              <div className="text-muted-foreground text-sm">Slug</div>
              <p className="font-mono text-sm">{organization.slug}</p>
            </div>
            <div>
              <div className="text-muted-foreground text-sm">CUIT</div>
              <p className="font-medium">{organization.cuit || "-"}</p>
            </div>
            <div>
              <div className="text-muted-foreground text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Fecha de Creación
                </div>
              </div>
              <p className="font-medium">
                {formatDate(organization.created_at)}
              </p>
            </div>
          </div>

          {/* Status Section */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-muted-foreground text-sm">Estado</div>
                <div className="flex items-center gap-2">
                  {isActive ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <p className="font-medium text-green-600">Activa</p>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 text-destructive" />
                      <p className="font-medium text-destructive">
                        Deshabilitada
                      </p>
                    </>
                  )}
                </div>
              </div>
              {isUpdating ? (
                <Button disabled variant={isActive ? "destructive" : "default"}>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                </Button>
              ) : (
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  variant={isActive ? "destructive" : "default"}
                >
                  {isActive ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Deshabilitar
                    </>
                  ) : (
                    <>
                      <LockOpen className="mr-2 h-4 w-4" />
                      Habilitar
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Usuarios ({members.length})</CardTitle>
          <CardDescription>
            Todos los usuarios que tienen acceso a esta organización
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationMembersTable members={members} roles={roles} />
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog onOpenChange={setShowConfirmDialog} open={showConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActive
                ? "¿Deshabilitar organización?"
                : "¿Habilitar organización?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? "Los usuarios no podrán acceder a esta organización una vez deshabilitada."
                : "Esta acción permitirá que los usuarios accedan nuevamente a esta organización."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={
              isActive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
            onClick={handleToggleStatus}
          >
            {isActive ? "Deshabilitar" : "Habilitar"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
