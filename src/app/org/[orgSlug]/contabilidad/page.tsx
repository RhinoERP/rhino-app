import { redirect } from "next/navigation";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function ContabilidadIndexPage({ params }: Props) {
  const { orgSlug } = await params;
  redirect(`/org/${orgSlug}/contabilidad/diario`);
}
