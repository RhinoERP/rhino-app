"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  importCarriers,
  importCustomerSupplierAssignments,
  importCustomers,
  importInitialBalances,
  importProducts,
  importStock,
  importSuppliers,
} from "@/app/org/[orgSlug]/import/actions";
import { HistoricalPurchasesImportDialog } from "@/components/import/historical-purchases-import-dialog";
import { HistoricalSalesImportDialog } from "@/components/import/historical-sales-import-dialog";
import { ImportCard } from "@/components/import/import-card";
import { ImportDialog } from "@/components/import/import-dialog";
import { importHistoricalPurchasesAction } from "@/modules/purchases/historical/actions/import-historical-purchases.action";
import type { HistoricalPurchaseRowData } from "@/modules/purchases/historical/types";
import { importHistoricalSalesAction } from "@/modules/sales/historical/actions/import-historical-sales.action";
import type { HistoricalSalesRowData } from "@/modules/sales/historical/types";

export type Template = {
  id:
    | "products"
    | "products_variants"
    | "stock"
    | "customers"
    | "suppliers"
    | "carriers"
    | "historical_sales"
    | "historical_purchases"
    | "customer_supplier_assignments"
    | "initial_balances";
  title: string;
  description: string;
  icon: React.ReactNode;
};

type ImportDataClientProps = {
  templates: readonly Template[];
  orgSlug: string;
  categories?: string[];
  customers?: string[];
  suppliers?: string[];
  carriers?: string[];
  sellers?: string[];
  purchasePriceLists?: { label: string; supplier: string }[];
  salesPriceLists?: string[];
  taxes?: string[];
};

type ImportFeedback = {
  success: boolean;
  message: string;
  errors: string[];
};
type StandardImportOutcome = ImportFeedback & {
  imported: number;
};

const REQUIRED_COLUMN_REGEX =
  /La columna '([^']+)' es obligatoria y está vacía en la fila (\d+)\.?/i;
const CLIENT_NOT_FOUND_REGEX =
  /cliente\s*["']?([^"']+)["']?\s*(?:no encontrado|no fue encontrado|not found)/i;

export function ImportDataClient({
  templates,
  orgSlug,
  categories,
  customers,
  suppliers,
  carriers,
  sellers,
  purchasePriceLists,
  salesPriceLists,
  taxes,
}: ImportDataClientProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  );
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(
    null
  );

  // Handler for historical sales (uses parsed data directly)
  const handleHistoricalSalesImport = async (
    data: HistoricalSalesRowData[]
  ) => {
    const result = await importHistoricalSalesAction({
      orgSlug,
      data,
    });

    if (result.success) {
      toast.success("Importación exitosa", {
        description: result.message,
        duration: 5000,
      });
    } else {
      toast.error("Error al importar", {
        description: result.message,
      });

      if (result.errors && result.errors.length > 0) {
        // Show detailed list of issues
        const issuesList = result.errors.slice(0, 5).join("\n");
        const moreIssues =
          result.errors.length > 5
            ? `\n...y ${result.errors.length - 5} más.`
            : "";

        toast.warning("Errores de importación", {
          description: `${issuesList}${moreIssues}`,
          duration: 10_000,
        });
      }
    }
  };

  // Handler for historical purchases (uses parsed data directly)
  const handleHistoricalPurchasesImport = async (
    data: HistoricalPurchaseRowData[]
  ) => {
    const result = await importHistoricalPurchasesAction({
      orgSlug,
      data,
    });

    if (result.success) {
      toast.success("Importación exitosa", {
        description: result.message,
        duration: 5000,
      });
    } else {
      toast.error("Error al importar", {
        description: result.message,
      });

      if (result.errors && result.errors.length > 0) {
        // Show detailed list of issues
        const issuesList = result.errors.slice(0, 5).join("\n");
        const moreIssues =
          result.errors.length > 5
            ? `\n...y ${result.errors.length - 5} más.`
            : "";

        toast.warning("Errores de importación", {
          description: `${issuesList}${moreIssues}`,
          duration: 10_000,
        });
      }
    }
  };

  // Handler for standard imports (file-based)
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import handling requires multiple conditional paths
  const handleImport = async (file: File): Promise<StandardImportOutcome> => {
    if (!selectedTemplate) {
      return {
        success: false,
        message: "No se seleccionó una plantilla.",
        errors: [],
        imported: 0,
      };
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      let result: Awaited<ReturnType<typeof importProducts>> | undefined;

      switch (selectedTemplate.id) {
        case "products":
        case "products_variants": {
          result = await importProducts(formData, orgSlug);
          break;
        }
        case "stock": {
          result = await importStock(formData, orgSlug);
          break;
        }
        case "customers": {
          result = await importCustomers(formData, orgSlug);
          break;
        }
        case "suppliers": {
          result = await importSuppliers(formData, orgSlug);
          break;
        }
        case "carriers": {
          result = await importCarriers(formData, orgSlug);
          break;
        }
        case "customer_supplier_assignments": {
          result = await importCustomerSupplierAssignments(formData, orgSlug);
          break;
        }
        case "initial_balances": {
          result = await importInitialBalances(formData, orgSlug);
          break;
        }
        default: {
          console.error("Unknown template type:", selectedTemplate.id);
          const fallbackFeedback = {
            success: false,
            message: "La plantilla seleccionada no es válida.",
            errors: [],
            imported: 0,
          } satisfies StandardImportOutcome;
          setImportFeedback(fallbackFeedback);
          return fallbackFeedback;
        }
      }

      if (!result) {
        return {
          success: false,
          message: "No se pudo obtener el resultado de la importación.",
          errors: [],
          imported: 0,
        };
      }

      const normalizedErrors = normalizeImportErrors(result.errors ?? []);
      const importedCount = result.imported ?? 0;
      const hasImportedRows = importedCount > 0;
      const isSuccessfulImport = result.success && hasImportedRows;
      const feedbackMessage =
        result.success && !hasImportedRows
          ? "No se importó ningún registro."
          : result.message;

      setImportFeedback({
        success: isSuccessfulImport,
        message: feedbackMessage,
        errors: normalizedErrors,
      });

      if (isSuccessfulImport) {
        toast.success("Importación exitosa", {
          description: result.message,
          duration: 5000,
        });

        if (normalizedErrors.length > 0) {
          // Show detailed list of issues
          const issuesList = normalizedErrors.slice(0, 5).join("\n");
          const moreIssues =
            normalizedErrors.length > 5
              ? `\n...y ${normalizedErrors.length - 5} más.`
              : "";

          toast.warning("Advertencias de importación", {
            description: `${issuesList}${moreIssues}`,
            duration: 10_000,
          });
        }
      } else if (result.success && !hasImportedRows) {
        toast.warning("Importación sin cambios", {
          description:
            normalizedErrors.length > 0
              ? "No se importó ningún registro. Revisá las advertencias."
              : "No se detectaron cambios para importar.",
          duration: 7000,
        });
      } else {
        const firstError = normalizedErrors[0];
        toast.error("Error al importar", {
          description: firstError ?? result.message,
        });
      }

      return {
        success: isSuccessfulImport,
        message: feedbackMessage,
        errors: normalizedErrors,
        imported: importedCount,
      };
    } catch (error) {
      console.error("Error importing file:", error);
      toast.error("Error inesperado", {
        description: "No se pudo procesar el archivo. Intenta nuevamente.",
      });
      const fallbackFeedback = {
        success: false,
        message: "No se pudo procesar el archivo. Intenta nuevamente.",
        errors: [],
        imported: 0,
      } satisfies StandardImportOutcome;
      setImportFeedback(fallbackFeedback);
      return fallbackFeedback;
    }
  };

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <ImportCard
            description={template.description}
            icon={template.icon}
            key={template.id}
            onClick={() => {
              setImportFeedback(null);
              setSelectedTemplate(template);
            }}
            title={template.title}
          />
        ))}
      </div>

      {/* Historical Sales uses special dialog with preview */}
      {selectedTemplate?.id === "historical_sales" && (
        <HistoricalSalesImportDialog
          onImport={handleHistoricalSalesImport}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTemplate(null);
            }
          }}
          open={true}
        />
      )}

      {/* Historical Purchases uses special dialog with preview */}
      {selectedTemplate?.id === "historical_purchases" && (
        <HistoricalPurchasesImportDialog
          onImport={handleHistoricalPurchasesImport}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTemplate(null);
            }
          }}
          open={true}
        />
      )}

      {/* Standard imports use regular dialog */}
      {selectedTemplate &&
        selectedTemplate.id !== "historical_sales" &&
        selectedTemplate.id !== "historical_purchases" && (
          <ImportDialog
            carriers={
              selectedTemplate.id === "carriers" ||
              selectedTemplate.id === "customers"
                ? carriers
                : undefined
            }
            categories={
              selectedTemplate.id === "products" ||
              selectedTemplate.id === "products_variants"
                ? categories
                : undefined
            }
            customers={customers}
            importResult={importFeedback}
            onClearImportResult={() => setImportFeedback(null)}
            onImport={handleImport}
            onOpenChange={(open) => {
              if (!open) {
                setImportFeedback(null);
                setSelectedTemplate(null);
              }
            }}
            open={true}
            purchasePriceLists={
              selectedTemplate.id === "customer_supplier_assignments"
                ? purchasePriceLists
                : undefined
            }
            salesPriceLists={
              selectedTemplate.id === "customer_supplier_assignments"
                ? salesPriceLists
                : undefined
            }
            sellers={
              selectedTemplate.id === "customers" ||
              selectedTemplate.id === "initial_balances"
                ? sellers
                : undefined
            }
            suppliers={suppliers}
            taxes={
              selectedTemplate.id === "products" ||
              selectedTemplate.id === "products_variants"
                ? taxes
                : undefined
            }
            templateId={
              selectedTemplate.id as
                | "products"
                | "products_variants"
                | "stock"
                | "customers"
                | "suppliers"
                | "carriers"
                | "customer_supplier_assignments"
                | "initial_balances"
            }
            templateTitle={selectedTemplate.title}
          />
        )}
    </>
  );
}

function normalizeImportErrors(errors: string[]): string[] {
  return errors.map((error) => {
    const missingRequired = error.match(REQUIRED_COLUMN_REGEX);

    if (missingRequired) {
      return `La columna '${missingRequired[1]}' es obligatoria y está vacía en la fila ${missingRequired[2]}.`;
    }

    const clientNotFound = error.match(CLIENT_NOT_FOUND_REGEX);

    if (clientNotFound) {
      return `El cliente '${clientNotFound[1]}' no fue encontrado. Verifica que esté escrito exactamente igual que en la sección de Clientes.`;
    }

    return error;
  });
}
