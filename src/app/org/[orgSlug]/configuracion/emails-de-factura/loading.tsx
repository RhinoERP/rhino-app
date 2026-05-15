export default function InvoiceEmailsPageLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Emails de factura</h1>
        <p className="text-muted-foreground text-sm">
          Configurá remitente, asunto, contenido y adjuntos para los emails de
          facturas fiscales.
        </p>
      </div>
      <div className="h-80 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
