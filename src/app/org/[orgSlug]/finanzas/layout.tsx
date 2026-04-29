import type { ReactNode } from "react";
import { FinanzasNav } from "@/components/finances/shared/finanzas-nav";

type FinanzasLayoutProps = {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
};

export default async function FinanzasLayout({
  children,
  params,
}: FinanzasLayoutProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Finanzas</h1>
        <p className="text-muted-foreground text-sm">
          Seguimiento financiero del establecimiento.
        </p>
      </div>

      <FinanzasNav orgSlug={orgSlug} />

      {children}
    </div>
  );
}
