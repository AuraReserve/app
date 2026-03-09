import DataOutputPage from "./page-client";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DataOutputPage slug={slug} />;
}
