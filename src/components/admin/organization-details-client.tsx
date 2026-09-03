"use client";

import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { removeOrganizationLogoAction } from "@/modules/admin/actions/remove-organization-logo.action";
import { uploadOrganizationLogoAction } from "@/modules/admin/actions/upload-organization-logo.action";
import { toggleOrganizationStatusAction } from "@/modules/organizations/actions/toggle-organization-status.action";
import { updateOrganizationModulesAction } from "@/modules/organizations/actions/update-organization-modules.action";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import type { OrganizationRole } from "@/modules/organizations/service/roles.service";
import type { Organization } from "@/modules/organizations/types";
import { OrganizationMembersTable } from "./organization-members-table";

type OrganizationDetailsClientProps = {
  organization: Organization;
  members: OrganizationMember[];
  remittanceMaskPrintingEnabled: boolean;
  roles: OrganizationRole[];
};

type OrganizationWithSalesAdvances = Organization & {
  sales_advances_enabled?: boolean;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This admin screen orchestrates independent stateful controls in one view.
export function OrganizationDetailsClient({
  organization,
  members,
  remittanceMaskPrintingEnabled: configuredRemittanceMaskPrintingEnabled,
  roles,
}: OrganizationDetailsClientProps) {
  const router = useRouter();
  const configuredSalesAdvancesEnabled =
    (organization as OrganizationWithSalesAdvances).sales_advances_enabled ??
    true;
  const [isActive, setIsActive] = useState(organization.is_active ?? true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdatingModules, setIsUpdatingModules] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [wholesaleEnabled, setWholesaleEnabled] = useState(
    organization.wholesale_enabled ?? true
  );
  const [posEnabled, setPosEnabled] = useState(
    organization.pos_enabled ?? true
  );
  const [productionEnabled, setProductionEnabled] = useState(
    organization.production_enabled ?? false
  );
  const [accountingEnabled, setAccountingEnabled] = useState(
    organization.accounting_enabled ?? false
  );
  const [salesAdvancesEnabled, setSalesAdvancesEnabled] = useState(
    configuredSalesAdvancesEnabled
  );
  const [commissionsEnabled, setCommissionsEnabled] = useState(
    organization.commissions_enabled ?? false
  );
  const [routeSheetsEnabled, setRouteSheetsEnabled] = useState(
    organization.route_sheets_enabled ?? false
  );

  const [supplierDiffCredits, setSupplierDiffCredits] = useState(
    organization.supplier_differentiated_credits ?? false
  );
  const [remittanceMaskPrintingEnabled, setRemittanceMaskPrintingEnabled] =
    useState(configuredRemittanceMaskPrintingEnabled);

  const [logoUrl, setLogoUrl] = useState<string | null>(
    organization.logo_url ?? null
  );
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoUrl(organization.logo_url ?? null);
  }, [organization.logo_url]);

  useEffect(() => {
    setIsActive(organization.is_active ?? true);
  }, [organization.is_active]);

  useEffect(() => {
    setWholesaleEnabled(organization.wholesale_enabled ?? true);
    setPosEnabled(organization.pos_enabled ?? true);
    setProductionEnabled(organization.production_enabled ?? false);
    setAccountingEnabled(organization.accounting_enabled ?? false);
    setSalesAdvancesEnabled(configuredSalesAdvancesEnabled);
    setCommissionsEnabled(organization.commissions_enabled ?? false);
    setRouteSheetsEnabled(organization.route_sheets_enabled ?? false);
    setSupplierDiffCredits(
      organization.supplier_differentiated_credits ?? false
    );
    setRemittanceMaskPrintingEnabled(configuredRemittanceMaskPrintingEnabled);
  }, [
    organization.wholesale_enabled,
    organization.pos_enabled,
    organization.supplier_differentiated_credits,
    organization.production_enabled,
    organization.accounting_enabled,
    configuredSalesAdvancesEnabled,
    organization.commissions_enabled,
    configuredRemittanceMaskPrintingEnabled,
  ]);

  const handleToggleStatus = async () => {
    setError(null);
    setIsUpdating(true);

    try {
      const result = await toggleOrganizationStatusAction(
        organization.id,
        !isActive,
        organization.slug ?? undefined
      );

      if (!result.success) {
        setError(result.error || "Error al actualizar la organización");
        setIsUpdating(false);
        return;
      }

      setIsActive(!isActive);
      setShowConfirmDialog(false);
      router.refresh();
    } catch (err) {
      setError("Error desconocido al actualizar la organización");
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const hasModuleChanges =
    wholesaleEnabled !== (organization.wholesale_enabled ?? true) ||
    posEnabled !== (organization.pos_enabled ?? true) ||
    productionEnabled !== (organization.production_enabled ?? false) ||
    accountingEnabled !== (organization.accounting_enabled ?? false) ||
    salesAdvancesEnabled !== configuredSalesAdvancesEnabled ||
    commissionsEnabled !== (organization.commissions_enabled ?? false) ||
    routeSheetsEnabled !== (organization.route_sheets_enabled ?? false) ||
    supplierDiffCredits !==
      (organization.supplier_differentiated_credits ?? false) ||
    remittanceMaskPrintingEnabled !== configuredRemittanceMaskPrintingEnabled;

  const handleUpdateModules = async () => {
    setModulesError(null);
    setIsUpdatingModules(true);

    try {
      const result = await updateOrganizationModulesAction(
        organization.id,
        {
          wholesaleEnabled,
          posEnabled,
          productionEnabled,
          accountingEnabled,
          salesAdvancesEnabled,
          commissionsEnabled,
          routeSheetsEnabled,
          supplierDifferentiatedCredits: supplierDiffCredits,
          remittanceMaskPrintingEnabled,
        },
        organization.slug ?? undefined
      );

      if (!result.success) {
        setModulesError(result.error || "Error al actualizar los módulos");
        return;
      }

      router.refresh();
    } catch (err) {
      setModulesError("Error desconocido al actualizar los módulos");
      console.error(err);
    } finally {
      setIsUpdatingModules(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setLogoError(null);
    setIsUploadingLogo(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await uploadOrganizationLogoAction(
        organization.id,
        organization.slug ?? "",
        formData
      );

      if (!result.success) {
        setLogoError(result.error);
        return;
      }

      setLogoUrl(result.logoUrl);
      router.refresh();
    } catch (err) {
      setLogoError("Error desconocido al subir el logo");
      console.error(err);
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
    }
  };

  const handleLogoRemove = async () => {
    setLogoError(null);
    setIsUploadingLogo(true);

    try {
      const result = await removeOrganizationLogoAction(
        organization.id,
        organization.slug ?? ""
      );

      if (!result.success) {
        setLogoError(result.error);
        return;
      }

      setLogoUrl(null);
      router.refresh();
    } catch (err) {
      setLogoError("Error desconocido al eliminar el logo");
      console.error(err);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver al Panel de Administración
          </Button>
        </Link>
      </div>

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

          {/* Logo Section */}
          <div className="border-t pt-4">
            <div className="mb-3">
              <div className="text-muted-foreground text-sm">Logo</div>
              <p className="text-muted-foreground text-xs">
                Se muestra en presupuestos, remitos y otros documentos. PNG, JPG
                o WebP (máx. 1MB).
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {logoUrl ? (
                  // biome-ignore lint/performance/noImgElement: admin-only preview, not a public page
                  <img
                    alt={`Logo de ${organization.name}`}
                    className="h-full w-full object-contain"
                    height={64}
                    src={logoUrl}
                    width={64}
                  />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex gap-2">
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={isUploadingLogo}
                  onChange={handleLogoUpload}
                  ref={logoInputRef}
                  type="file"
                />
                <Button
                  disabled={isUploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                  size="sm"
                  variant="outline"
                >
                  {isUploadingLogo ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {logoUrl ? "Cambiar" : "Subir logo"}
                </Button>
                {logoUrl && (
                  <Button
                    disabled={isUploadingLogo}
                    onClick={handleLogoRemove}
                    size="sm"
                    variant="destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </Button>
                )}
              </div>
            </div>
            {logoError && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-destructive text-xs">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {logoError}
              </div>
            )}
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

          <div className="border-t pt-4">
            <div className="mb-4">
              <div className="text-muted-foreground text-sm">
                Configuración de Módulos
              </div>
              <p className="text-sm">
                Define qué módulos comerciales están disponibles para esta
                organización.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Venta Distribuidora</p>
                  <p className="text-muted-foreground text-xs">
                    Habilita ventas mayoristas y cobranzas asociadas.
                  </p>
                </div>
                <Switch
                  checked={wholesaleEnabled}
                  disabled={isUpdatingModules}
                  onCheckedChange={setWholesaleEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Venta Directa / POS</p>
                  <p className="text-muted-foreground text-xs">
                    Habilita terminales POS, sesiones y ventas directas.
                  </p>
                </div>
                <Switch
                  checked={posEnabled}
                  disabled={isUpdatingModules}
                  onCheckedChange={setPosEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Módulo de Producción</p>
                  <p className="text-muted-foreground text-xs">
                    Habilita órdenes de producción y control de fabricación.
                  </p>
                </div>
                <Switch
                  checked={productionEnabled}
                  disabled={isUpdatingModules}
                  onCheckedChange={setProductionEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Módulo de Contabilidad</p>
                  <p className="text-muted-foreground text-xs">
                    Habilita libros contables, asientos y plan de cuentas.
                  </p>
                </div>
                <Switch
                  checked={accountingEnabled}
                  disabled={isUpdatingModules}
                  onCheckedChange={setAccountingEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Anticipos de clientes</p>
                  <p className="text-muted-foreground text-xs">
                    Muestra la opción de generar, facturar y liquidar anticipos
                    en las ventas.
                  </p>
                </div>
                <Switch
                  checked={salesAdvancesEnabled}
                  disabled={isUpdatingModules}
                  onCheckedChange={setSalesAdvancesEnabled}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Módulo de Comisiones</p>
                  <p className="text-muted-foreground text-xs">
                    Habilita el cálculo de comisiones a vendedores sobre cobros
                    recibidos.
                  </p>
                </div>
                <Switch
                  checked={commissionsEnabled}
                  disabled={isUpdatingModules}
                  onCheckedChange={setCommissionsEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Módulo de Hoja de Ruta</p>
                  <p className="text-muted-foreground text-xs">
                    Habilita la hoja de ruta para agrupar y despachar ventas por
                    transportista y fecha.
                  </p>
                </div>
                <Switch
                  checked={routeSheetsEnabled}
                  disabled={isUpdatingModules}
                  onCheckedChange={setRouteSheetsEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    Diferenciar créditos por proveedor
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Los créditos de clientes se asocian al proveedor que los
                    originó. Solo se pueden aplicar a deudas con el mismo
                    proveedor.
                  </p>
                </div>
                <Switch
                  checked={supplierDiffCredits}
                  disabled={isUpdatingModules}
                  onCheckedChange={setSupplierDiffCredits}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Máscara de remito preimpreso</p>
                  <p className="text-muted-foreground text-xs">
                    Habilita la impresión de datos sobre talonarios de remito
                    preimpresos para esta organización.
                  </p>
                </div>
                <Switch
                  checked={remittanceMaskPrintingEnabled}
                  disabled={isUpdatingModules}
                  onCheckedChange={setRemittanceMaskPrintingEnabled}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                disabled={!hasModuleChanges || isUpdatingModules}
                onClick={handleUpdateModules}
              >
                {isUpdatingModules ? "Guardando..." : "Guardar módulos"}
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {modulesError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {modulesError}
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
