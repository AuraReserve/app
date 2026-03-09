import OutputDetailClient from "./page-client";

export default async function OutputDetailPage({
  params,
}: {
  params: Promise<{ slug: string; integrationId: string }>;
}) {
  const { slug, integrationId } = await params;
  return <OutputDetailClient slug={slug} integrationId={integrationId} />;
}
