import { getCollectionsPageAccess } from "@/modules/collections/service/collections-access.service";

type CollectionsModuleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CollectionsModuleLayout({
  children,
  params,
}: CollectionsModuleLayoutProps) {
  const { orgSlug } = await params;
  await getCollectionsPageAccess(orgSlug);

  return children;
}
