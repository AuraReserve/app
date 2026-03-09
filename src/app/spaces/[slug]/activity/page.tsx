import { redirect } from "next/navigation";
import { getSpaceBySlug, getSpaceStores } from "@/lib/dal";
import ActivityPageClient from "./page-client";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const space = await getSpaceBySlug(slug);
  if (!space) {
    redirect("/spaces");
  }

  const stores = await getSpaceStores(space.id);
  const streams = stores.map((s) => ({ id: s.id, name: s.name }));

  return (
    <ActivityPageClient
      slug={slug}
      spaceId={space.id}
      spaceName={space.name}
      streams={streams}
    />
  );
}
