"use client";

import {
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
  FileTextIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderWithHistory } from "@/modules/orders/types";

type BocetoEditorProps = {
  orgSlug: string;
  order: OrderWithHistory;
};

export function BocetoEditor(_props: BocetoEditorProps) {
  const order = _props.order;
  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";
  const itemCount = quote?.quote_items.length ?? 0;
  const designs = order.order_designs;
  const fileUrl = designs?.products.find(
    (product) => product.reference_image
  )?.reference_image;
  const fileName = fileUrl
    ? decodeURIComponent(new URL(fileUrl).pathname.split("/").pop() ?? "boceto")
    : null;
  const isPdf = fileUrl
    ? new URL(fileUrl).pathname.toLowerCase().endsWith(".pdf")
    : false;
  const downloadUrl = fileUrl ? new URL(fileUrl) : null;
  downloadUrl?.searchParams.set("download", fileName ?? "boceto");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Boceto — {order.order_number}</h1>
        <p className="text-muted-foreground text-sm">
          {customerName} &middot; {itemCount} producto
          {itemCount !== 1 ? "s" : ""}
        </p>
      </div>

      {fileUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Boceto adjunto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 truncate text-muted-foreground text-sm">
                {fileName}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={fileUrl} rel="noopener noreferrer" target="_blank">
                    <ArrowSquareOutIcon className="size-4" /> Abrir boceto
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={downloadUrl?.toString()}>
                    <DownloadSimpleIcon className="size-4" /> Descargar
                  </a>
                </Button>
              </div>
            </div>
            {isPdf ? (
              <iframe
                className="h-[70vh] min-h-96 w-full rounded-md border"
                src={fileUrl}
                title="Vista previa del boceto"
              />
            ) : (
              // biome-ignore lint/performance/noImgElement: the public Storage URL is already optimized as an uploaded document
              <img
                alt={`Boceto de ${order.order_number}`}
                className="max-h-[70vh] w-full rounded-md border object-contain"
                height={800}
                src={fileUrl}
                width={1200}
              />
            )}
            {designs?.general_notes && (
              <div>
                <h4 className="mb-1 font-medium text-sm">Notas generales</h4>
                <p className="text-muted-foreground text-sm">
                  {designs.general_notes}
                </p>
              </div>
            )}
            {designs?.client_approved_at && (
              <p className="text-emerald-600 text-sm">
                Aprobado por el cliente el{" "}
                {new Date(designs.client_approved_at).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!fileUrl && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <FileTextIcon
              className="h-12 w-12 text-muted-foreground/50"
              weight="duotone"
            />
            <div className="text-center">
              <p className="font-medium text-muted-foreground">
                Sin boceto adjunto
              </p>
              <p className="mt-1 text-muted-foreground/60 text-sm">
                Este pedido no tiene un archivo de boceto disponible.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
