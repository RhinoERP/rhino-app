"use client";

import { EyeIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDocumentSignedUrlAction } from "@/modules/documents/actions/get-document-signed-url.action";

type RemittancePreviewButtonProps = {
  pdfUrl: string;
  label?: string;
};

export function RemittancePreviewButton({
  pdfUrl,
  label = "Ver",
}: RemittancePreviewButtonProps) {
  const handleOpen = async () => {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      toast.error(
        "No se pudo abrir la vista previa. Habilitá las ventanas emergentes."
      );
      return;
    }

    previewWindow.opener = null;

    try {
      const result = await getDocumentSignedUrlAction(pdfUrl);
      if (!result.success) {
        previewWindow.close();
        toast.error(result.error);
        return;
      }

      previewWindow.location.href = result.url;
    } catch {
      previewWindow.close();
      toast.error("No se pudo abrir el documento");
    }
  };

  return (
    <Button onClick={handleOpen} size="sm" type="button" variant="outline">
      <EyeIcon className="mr-2 size-4" weight="bold" />
      {label}
    </Button>
  );
}
