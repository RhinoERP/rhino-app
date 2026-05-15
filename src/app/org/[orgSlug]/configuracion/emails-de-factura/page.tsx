import { InvoiceEmailSettings } from "@/components/configuration/invoice-email-settings";

type InvoiceEmailsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function InvoiceEmailsPage({
  params,
}: InvoiceEmailsPageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Emails de factura</h1>
        <p className="text-muted-foreground text-sm">
          Configurá remitente, asunto, contenido y adjuntos para los emails de
          facturas fiscales.
        </p>
      </div>

      <InvoiceEmailSettings orgSlug={orgSlug} />
    </div>
  );
}
