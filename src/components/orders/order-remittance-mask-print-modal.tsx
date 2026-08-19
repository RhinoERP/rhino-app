"use client";

import { toast } from "sonner";
import { RemittanceMaskPrintModal } from "@/components/sales/remittance-mask-print-modal";
import { previewOrderRemittanceMaskAction } from "@/modules/orders/actions/preview-order-remittance-mask.action";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";

type OrderRemittanceMaskPrintModalProps = {
  orgSlug: string;
  childOrderId: string;
  remitoNumber: string;
};

export function OrderRemittanceMaskPrintModal({
  orgSlug,
  childOrderId,
  remitoNumber,
}: OrderRemittanceMaskPrintModalProps) {
  const { data: settings } = useOrgSettings(orgSlug);

  if (!settings?.remittance_mask_printing_enabled) {
    return null;
  }

  return (
    <RemittanceMaskPrintModal
      loadMask={async () => {
        const result = await previewOrderRemittanceMaskAction(
          orgSlug,
          childOrderId,
          remitoNumber
        );

        if (result.success) {
          return result.html;
        }

        toast.error(result.error ?? "No se pudo generar la máscara de remito");
        return null;
      }}
    />
  );
}
