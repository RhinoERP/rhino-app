import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      {params?.error ? (
        <p className="text-muted-foreground text-sm">
          Code error: {params.error}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          An unspecified error occurred.
        </p>
      )}
    </>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <AuthCard title="Lo sentimos, ocurrió un error.">
      <Suspense>
        <ErrorContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
