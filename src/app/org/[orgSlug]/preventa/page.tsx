import { redirect } from "next/navigation";

type PreSalesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PreSalesPage({ params }: PreSalesPageProps) {
  const { orgSlug } = await params;
  redirect(`/org/${orgSlug}/ventas?estado=DRAFT`);
}
