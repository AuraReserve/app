import { redirect } from "next/navigation";
import { getSpaceBySlug, getSpaceStores, getSpaceIntegrations } from "@/lib/dal";
import { getSpaceRole } from "@/lib/auth-utils";
import { getSpacePermissions } from "@/lib/permissions";
import SpaceDetail from "./page-client";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const space = await getSpaceBySlug(slug);
  if (!space) {
    redirect("/spaces");
  }

  const [stores, integrations, role] = await Promise.all([
    getSpaceStores(space.id),
    getSpaceIntegrations(space.id),
    getSpaceRole(space.id),
  ]);

  const permissions = getSpacePermissions(role);

  return (
    <SpaceDetail
      slug={slug}
      space={JSON.parse(JSON.stringify(space))}
      stores={JSON.parse(JSON.stringify(stores))}
      integrations={JSON.parse(JSON.stringify(integrations))}
      permissions={permissions}
    />
  );
}
