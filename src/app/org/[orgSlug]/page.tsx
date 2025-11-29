type OrganizationPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function OrganizationPage({
  params,
}: OrganizationPageProps) {
  const { orgSlug } = await params;
  return <div>Organization: {orgSlug}</div>;
}
