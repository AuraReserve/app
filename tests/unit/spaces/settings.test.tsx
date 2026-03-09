import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Space as SpaceType } from "@/lib/entities/types";
import { setMockCurrentUser } from "../../utils/mockCurrentUser";

const spaceFilterMock = vi.fn();
const spaceUpdateMock = vi.fn();
const spaceDeleteMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
    push: pushMock,
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open = false,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (nextOpen: boolean) => void;
  }) => <div data-open={open}>{open ? children : null}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/entities", () => ({
  Space: { filter: spaceFilterMock, update: spaceUpdateMock, delete: spaceDeleteMock },
}));

const SpaceSettingsPage = (await import("@/app/spaces/[slug]/settings/page-client")).default;

const createSpace = (overrides: Partial<SpaceType> = {}): SpaceType => ({
  id: "space-1",
  name: "Alpha Space",
  description: "Reserve operations",
  slug: "alpha-space",
  api_identifier: "alpha-space",
  api_identifier_source: "slug",
  is_active: true,
  created_by: "user-1",
  created_date: "2024-04-01T00:00:00.000Z",
  verification_public: true,
  ...overrides,
});

describe("Space settings management", () => {
  beforeEach(() => {
    spaceFilterMock.mockReset();
    spaceUpdateMock.mockReset();
    spaceDeleteMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    pushMock.mockReset();
    setMockCurrentUser({
      user: {
        id: "user-99",
        role: "owner",
        email: "owner@example.com",
        name: "Owner Example",
        image: null,
        spaces: [],
      },
    });

    // Mock the space permissions and integrations endpoints
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/spaces/space-1/role") {
        return {
          ok: true,
          json: async () => ({ role: "admin" }),
        };
      }
      if (url.includes("/api/spaces/space-1/data-inputs")) {
        return {
          ok: true,
          json: async () => ([]),
        };
      }
      if (url.includes("/api/spaces/space-1/data-outputs")) {
        return {
          ok: true,
          json: async () => ([]),
        };
      }
      throw new Error(`Unhandled fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks metadata changes, persists updates, and redirects when the slug drives the API identifier", async () => {
    const initialSpace = createSpace();
    spaceFilterMock.mockResolvedValue([initialSpace]);

    spaceUpdateMock.mockImplementation(async (_id: string, payload: Partial<SpaceType>) =>
      createSpace({ ...payload }),
    );

    await act(async () => {
      render(
        <SpaceSettingsPage
          slug="alpha-space"
        />,
      );
    });

    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalled());

    const saveButton = await screen.findByRole("button", { name: "Save Changes" });
    expect(saveButton).toBeDisabled();

    const user = userEvent.setup();

    const nameInput = screen.getByLabelText("Space Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Alpha Space Revamp");

    const descriptionInput = screen.getByLabelText("Description");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "Updated reserve operations overview");

    const slugInput = screen.getByLabelText("Space Slug");
    await user.clear(slugInput);
    await user.type(slugInput, "Alpha Space 2025");

    expect(await screen.findByText(/You have unsaved changes/i)).toBeVisible();
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => expect(spaceUpdateMock).toHaveBeenCalledTimes(1));

    const [spaceId, payload] = spaceUpdateMock.mock.calls[0];
    expect(spaceId).toBe("space-1");
    expect(payload).toMatchObject({
      name: "Alpha Space Revamp",
      description: "Updated reserve operations overview",
    });
    expect(payload.slug).toBeTruthy();
    expect(payload.slug).not.toBe(initialSpace.slug);
    expect(payload.api_identifier).toBe(payload.slug);

    expect(await screen.findByText("Settings saved. URLs and API endpoints now use the new slug.")).toBeVisible();

    await waitFor(() => expect(saveButton).toBeDisabled());

    const updatedSlug = payload.slug as string;

    await waitFor(
      () => {
        expect(replaceMock).toHaveBeenCalledWith(`/spaces/${updatedSlug}/settings`);
        expect(refreshMock).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  }, 12000);

  it("restricts permanent deletion to elevated roles and enforces exact name confirmation", async () => {
    const initialSpace = createSpace();
    spaceFilterMock.mockResolvedValue([initialSpace]);

    const user = userEvent.setup();

    let ownerView!: ReturnType<typeof render>;
    await act(async () => {
      ownerView = render(
        <SpaceSettingsPage
          slug="alpha-space"
        />,
      );
    });

    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalled());

    expect(await screen.findByText("Danger Zone")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete Space" }));

    const confirmationInput = await screen.findByLabelText(/Type .* to confirm/i);
    const confirmButton = screen.getByRole("button", { name: "Delete Space Permanently" });
    expect(confirmButton).toBeDisabled();

    await user.type(confirmationInput, "Wrong Space");
    expect(confirmButton).toBeDisabled();

    await user.clear(confirmationInput);
    await user.type(confirmationInput, initialSpace.name);
    expect(confirmButton).toBeEnabled();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Delete Space Permanently" })).not.toBeInTheDocument(),
    );

    ownerView.unmount();

    setMockCurrentUser({
      user: {
        id: "user-55",
        role: "member",
        email: "member@example.com",
        name: "Member Example",
        image: null,
        spaces: [],
      },
    });

    await act(async () => {
      render(
        <SpaceSettingsPage
          slug="alpha-space"
        />,
      );
    });

    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledTimes(2));

    expect(screen.queryByText("Danger Zone")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Space" })).not.toBeInTheDocument();
  });

  it("deletes the space and returns to the catalog after confirmation", async () => {
    const initialSpace = createSpace();
    spaceFilterMock.mockResolvedValue([initialSpace]);
    spaceDeleteMock.mockResolvedValue(true);

    const user = userEvent.setup();

    await act(async () => {
      render(
        <SpaceSettingsPage
          slug="alpha-space"
        />,
      );
    });

    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalled());

    await user.click(await screen.findByRole("button", { name: "Delete Space" }));

    const confirmationInput = await screen.findByLabelText(/Type .* to confirm/i);
    await user.type(confirmationInput, initialSpace.name);

    const confirmButton = screen.getByRole("button", { name: "Delete Space Permanently" });
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() => expect(spaceDeleteMock).toHaveBeenCalledWith(initialSpace.id));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/spaces"));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Delete Space Permanently" })).not.toBeInTheDocument(),
    );
  });
});
