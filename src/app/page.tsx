import { redirect } from "next/navigation";
import { Suspense } from "react";

import { resolveUserRedirect } from "@/modules/organizations/service/organizations.service";

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

async function HomeRedirect() {
  const redirectTo = await resolveUserRedirect();
  redirect(redirectTo);
  return null;
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HomeRedirect />
    </Suspense>
  );
}
