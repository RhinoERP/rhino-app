export function MeliAccountingAccessError({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <p className="text-destructive text-sm" role="alert">
      No se pudo consultar la configuración contable Meli. La revisión contable
      no está disponible; actualizá la página para reintentar.
    </p>
  );
}
