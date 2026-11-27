import { notFound } from "next/navigation";
import { ProgressPage } from "@/components/seller-progress/progress-page";
import {
  getSellerProgress,
  SellerProgressAccessError,
} from "@/modules/seller-progress/progress.service";

export default async function MyProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { orgSlug } = await params;
  const { mes } = await searchParams;
  try {
    const snapshot = await getSellerProgress(orgSlug, mes);
    return <ProgressPage orgSlug={orgSlug} snapshot={snapshot} />;
  } catch (error) {
    if (error instanceof SellerProgressAccessError) {
      notFound();
    }
    throw error;
  }
}
