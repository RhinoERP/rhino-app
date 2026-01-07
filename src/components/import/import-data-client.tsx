"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  importCustomers,
  importProducts,
  importStock,
  importSuppliers,
} from "@/app/org/[orgSlug]/import/actions";
import { ImportCard } from "@/components/import/import-card";
import { ImportDialog } from "@/components/import/import-dialog";

type Template = {
  id: "products" | "stock" | "customers" | "suppliers";
  title: string;
  description: string;
  icon: React.ReactNode;
};

type ImportDataClientProps = {
  templates: readonly Template[];
  orgSlug: string;
};

export function ImportDataClient({
  templates,
  orgSlug,
}: ImportDataClientProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import handling requires multiple conditional paths
  const handleImport = async (file: File) => {
    if (!selectedTemplate) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      let result: Awaited<ReturnType<typeof importProducts>> | undefined;

      switch (selectedTemplate.id) {
        case "products": {
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
        default: {
          console.error("Unknown template type:", selectedTemplate.id);
          return;
        }
      }

      if (!result) {
        return;
      }

      if (result.success) {
        toast.success("Importación exitosa", {
          description: result.message,
          duration: 5000,
        });

        if (result.errors && result.errors.length > 0) {
          console.warn("Import issues:", result.errors);

          // Show detailed list of issues
          const issuesList = result.errors.slice(0, 5).join("\n");
          const moreIssues =
            result.errors.length > 5
              ? `\n...y ${result.errors.length - 5} más.`
              : "";

          toast.warning("Advertencias de importación", {
            description: `${issuesList}${moreIssues}\n\nRevisa la consola para más detalles.`,
            duration: 10_000,
          });
        }
      } else {
        toast.error("Error al importar", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error importing file:", error);
      toast.error("Error inesperado", {
        description: "No se pudo procesar el archivo. Intenta nuevamente.",
      });
    }
  };

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map((template) => (
          <ImportCard
            description={template.description}
            icon={template.icon}
            key={template.id}
            onClick={() => setSelectedTemplate(template)}
            title={template.title}
          />
        ))}
      </div>

      {selectedTemplate && (
        <ImportDialog
          onImport={handleImport}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTemplate(null);
            }
          }}
          open={!!selectedTemplate}
          templateId={selectedTemplate.id}
          templateTitle={selectedTemplate.title}
        />
      )}
    </>
  );
}
