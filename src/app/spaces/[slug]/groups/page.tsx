import GroupsPageClient from "./page-client";

export default async function GroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GroupsPageClient slug={slug} />;
}
