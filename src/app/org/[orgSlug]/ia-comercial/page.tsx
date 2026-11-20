import { redirect } from "next/navigation";
import { CommercialAiApp } from "@/components/commercial-ai/commercial-ai-app";
import { getCommercialAiSnapshot } from "@/modules/commercial-ai/service/commercial-ai.service";

type CommercialAiPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function CommercialAiPage({
  params,
}: CommercialAiPageProps) {
  const { orgSlug } = await params;
  const snapshot = await getCommercialAiSnapshot(orgSlug);

  if (!snapshot) {
    redirect(`/org/${orgSlug}`);
  }

  return <CommercialAiApp snapshot={snapshot} />;
}
