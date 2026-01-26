"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRemittanceGenerator } from "@/modules/sales/hooks/use-remittance-generator";

type RemittanceButtonProps = {
  orgSlug: string;
  saleId: string;
  type: "PRESUPUESTO" | "REMITO_FINAL";
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  disabled?: boolean;
};

export function RemittanceButton({
  orgSlug,
  saleId,
  type,
  label,
  variant = "outline",
  size = "default",
  disabled = false,
}: RemittanceButtonProps) {
  const { generateRemittance, isGenerating } = useRemittanceGenerator({
    orgSlug,
    saleId,
  });
  const [localLoading, setLocalLoading] = useState(false);

  const handleGenerate = async (): Promise<void> => {
    setLocalLoading(true);
    try {
      await generateRemittance(type);
      toast.success(
        type === "PRESUPUESTO"
          ? "Presupuesto generado correctamente"
          : "Remito generado correctamente"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al generar el documento"
      );
    } finally {
      setLocalLoading(false);
    }
  };

  const isLoading = isGenerating || localLoading;
  const buttonLabel =
    label ??
    (type === "PRESUPUESTO" ? "Generar Presupuesto" : "Generar Remito");

  return (
    <Button
      disabled={disabled || isLoading}
      onClick={handleGenerate}
      size={size}
      type="button"
      variant={variant}
    >
      {isLoading ? (
        <>Generando...</>
      ) : (
        <>
          <FileText className="mr-2 h-4 w-4" />
          {buttonLabel}
        </>
      )}
    </Button>
  );
}
