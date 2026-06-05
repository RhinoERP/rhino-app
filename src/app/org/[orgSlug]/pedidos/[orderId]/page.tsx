import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { OrderDetailClient } from "@/components/orders/order-detail-client";
import { getQueryClient } from "@/lib/get-query-client";
import { orderDetailServerQueryOptions } from "@/modules/orders/queries/queries.server";
import { getOrderById } from "@/modules/orders/service/orders.service";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";

type OrderDetailPageProps = {
  params: Promise<{ orgSlug: string; orderId: string }>;
};

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { orgSlug, orderId } = await params;
  await guardOrganizationModuleAccess(orgSlug, "production");

  const order = await getOrderById(orgSlug, orderId);

  if (!order) {
    notFound();
  }

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(
    orderDetailServerQueryOptions(orgSlug, orderId)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrderDetailClient order={order} orgSlug={orgSlug} />
    </HydrationBoundary>
  );
}
