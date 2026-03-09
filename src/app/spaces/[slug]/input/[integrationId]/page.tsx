import InputDetailClient from "./page-client";

export default async function InputDetailPage({
  params,
}: {
  params: Promise<{ slug: string; integrationId: string }>;
}) {
  const { slug, integrationId } = await params;
  return <InputDetailClient slug={slug} integrationId={integrationId} />;
}
