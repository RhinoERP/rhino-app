"use client";

import { EyeIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type RemittancePreviewButtonProps = {
  pdfUrl: string;
  label?: string;
};

export function RemittancePreviewButton({
  pdfUrl,
  label = "Ver",
}: RemittancePreviewButtonProps) {
  const handleOpen = () => {
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Button onClick={handleOpen} size="sm" type="button" variant="outline">
      <EyeIcon className="mr-2 size-4" weight="bold" />
      {label}
    </Button>
  );
}
