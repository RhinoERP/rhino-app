import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BocetoEditor } from "@/components/orders/boceto-editor";
import { Button } from "@/components/ui/button";
import { getOrderById } from "@/modules/orders/service/orders.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";

type BocetoPageProps = {
  params: Promise<{ orgSlug: string; orderId: string }>;
};

export default async function BocetoPage({ params }: BocetoPageProps) {
  const { orgSlug, orderId } = await params;
  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, "orders.production");
  const order = await getOrderById(orgSlug, orderId);

  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost">
        <Link
          className="inline-flex items-center gap-1"
          href={`/org/${orgSlug}/produccion`}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Volver a Producción
        </Link>
      </Button>

      <BocetoEditor order={order} orgSlug={orgSlug} />
    </div>
  );
}
