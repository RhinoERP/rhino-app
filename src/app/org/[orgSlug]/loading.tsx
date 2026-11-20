import { Spinner } from "@/components/ui/spinner";

export default function OrganizationLoading() {
  return (
    <output className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Spinner aria-label="Cargando" className="size-8" />
      Cargando página…
    </output>
  );
}
