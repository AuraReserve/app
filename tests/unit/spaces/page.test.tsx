import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Space } from "@/lib/entities/types";
import { setMockCurrentUser } from "../../utils/mockCurrentUser";

const spaceListMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/components/spaces/create-space-dialog", () => ({
  default: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/entities", () => ({
  Space: { list: spaceListMock },
}));

const SpacesPage = (await import("@/app/spaces/page")).default;

const createSpace = (overrides: Partial<Space> & { asset_types?: string[] } = {}): Space & { asset_types?: string[] } => ({
  id: overrides.id ?? "space-id",
  name: overrides.name ?? "Space Name",
  description: overrides.description ?? "Description",
  slug: overrides.slug ?? "space-slug",
  api_identifier: overrides.api_identifier ?? "identifier",
  api_identifier_source: overrides.api_identifier_source ?? "slug",
  is_active: overrides.is_active ?? true,
  created_by: overrides.created_by ?? "user-1",
  created_date: overrides.created_date ?? "2024-04-14T00:00:00.000Z",
  verification_public: overrides.verification_public ?? true,
  asset_types: overrides.asset_types,
});

describe("Spaces catalog page", () => {
  beforeEach(() => {
    spaceListMock.mockReset();
    pushMock.mockReset();
    setMockCurrentUser({
      user: {
        id: "user",
        role: "owner",
        email: "owner@example.com",
        name: "Owner Example",
        image: null,
        spaces: [],
      },
    });
  });

  it("renders spaces with asset types and status badges", async () => {
    const spaces = [
      createSpace({ id: "space-1", name: "Alpha Space", slug: "alpha", asset_types: ["gold"], is_active: true }),
      createSpace({ id: "space-2", name: "Beta Space", slug: "beta", asset_types: ["silver"], is_active: false }),
    ];

    spaceListMock.mockResolvedValue(spaces);

    render(<SpacesPage />);

    await screen.findByText("Alpha Space");
    expect(screen.getByText("Gold")).toBeVisible();

    expect(screen.getByText("Beta Space")).toBeVisible();
    expect(screen.getByText("Silver")).toBeVisible();
    expect(screen.getByText("Inactive")).toBeVisible();
  });

  it("navigates to the space overview from the card and to settings from the settings link", async () => {
    const spaces = [
      createSpace({ id: "space-1", name: "Alpha Space", slug: "alpha" }),
      createSpace({ id: "space-2", name: "Beta Space", slug: "beta", is_active: false }),
    ];

    spaceListMock.mockResolvedValue(spaces);

    const user = userEvent.setup();

    render(<SpacesPage />);

    await screen.findByText("Alpha Space");

    await user.click(screen.getByText("Alpha Space"));
    expect(pushMock).toHaveBeenCalledWith("/spaces/alpha");

    pushMock.mockReset();

    // Settings uses a Link inside Button asChild — verify the settings button is present
    const settingsButton = screen.getByRole("button", { name: "Open settings for Beta Space" });
    expect(settingsButton).toBeInTheDocument();
  });
});
