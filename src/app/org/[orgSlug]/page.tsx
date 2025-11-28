import { redirect } from "next/navigation";
import { Suspense } from "react";

import { isUserMemberOfOrganization } from "@/modules/organizations/service/organizations.service";

type OrganizationPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

async function OrganizationContent({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const isMember = await isUserMemberOfOrganization(orgSlug);

  if (!isMember) {
    redirect("/");
  }

  return <div>Organization: {orgSlug}</div>;
}

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export default function OrganizationPage({ params }: OrganizationPageProps) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OrganizationContent params={params} />
    </Suspense>
  );
}
